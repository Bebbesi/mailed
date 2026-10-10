import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { userSettings, users } from "../db/schema";
import { env, isLocalDomain, primaryDomain } from "../env";
import { badRequest, conflict, unauthorized, isUniqueViolation, pgError } from "../errors";
import { burnPasswordCheck, hashPassword, passwordSchema, verifyPassword } from "../auth/password";
import { consumeAuthToken, issueAuthToken } from "../auth/tokens";
import { invalidateUserSessions } from "../auth/session-core";
import { domainOf, normalizeAddress } from "../mail/address";
import { sendPasswordResetEmail, sendVerificationEmail } from "../mail/system-mail";
import { storage, userPrefix } from "../storage";
import { logger } from "../logger";

const RESERVED = new Set([
  "admin", "administrator", "postmaster", "hostmaster", "webmaster", "abuse", "security", "root", "noreply",
  "no-reply", "mailer-daemon", "support", "help", "info", "billing", "privacy", "legal", "system", "mailed",
  "dmarc", "dmarc-reports", "bounce", "bounces", "notifications",
]);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Use at least 3 characters.")
  .max(32, "Use at most 32 characters.")
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "Use letters, numbers, dots, dashes or underscores.")
  .refine((v) => !/[._-]{2}/.test(v), "Avoid consecutive punctuation.")
  .refine((v) => !RESERVED.has(v), "This address is reserved.");

const nameSchema = z.string().trim().min(1, "Required.").max(60, "Too long.");

export const registerSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  username: usernameSchema,
  recoveryEmail: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;

export async function isAddressAvailable(username: string): Promise<boolean> {
  const address = `${username.toLowerCase()}@${primaryDomain()}`;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.address, address)).limit(1);
  return !row;
}

export async function registerUser(input: RegisterInput) {
  if (!env().REGISTRATION_ENABLED) throw badRequest("Registration is currently closed.");
  const address = `${input.username}@${primaryDomain()}`;
  if (isLocalDomain(domainOf(input.recoveryEmail))) {
    throw badRequest("Use an email address outside Mailed so you can recover your account.", { field: "recoveryEmail" });
  }
  const passwordHash = await hashPassword(input.password);
  try {
    const user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          firstName: input.firstName,
          lastName: input.lastName,
          address,
          recoveryEmail: input.recoveryEmail,
          passwordHash,
          passwordChangedAt: new Date(),
          quotaBytes: env().DEFAULT_QUOTA_MB * 1024 * 1024,
        })
        .returning();
      await tx.insert(userSettings).values({ userId: u.id });
      return u;
    });
    const token = await issueAuthToken(user.id, "verify_email", user.recoveryEmail);
    const mail = await sendVerificationEmail(user.recoveryEmail, user.firstName, token);
    return { user, verificationSent: mail.delivered };
  } catch (err) {
    const pg = pgError(err);
    if (pg.code === "23505") {
      const c = pg.constraint ?? "";
      if (c.includes("recovery")) throw conflict("An account already uses this recovery email.", { field: "recoveryEmail" });
      throw conflict("This address is already taken.", { field: "username" });
    }
    throw err;
  }
}

/**
 * Verifies credentials. Accepts the Mailed address, the bare username, or the
 * recovery email. Unknown accounts still run a hash to keep timing uniform.
 */
export async function authenticate(identifier: string, password: string) {
  const id = normalizeAddress(identifier);
  const candidates = id.includes("@") ? [id] : [`${id}@${primaryDomain()}`];
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.address, candidates[0]), eq(users.recoveryEmail, candidates[0])))
    .limit(1);
  if (!user) {
    await burnPasswordCheck(password);
    return null;
  }
  const ok = await verifyPassword(user.passwordHash, password);
  return ok ? user : null;
}

export async function resendVerification(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthorized();
  if (user.emailVerifiedAt) return { alreadyVerified: true, sent: false };
  const token = await issueAuthToken(user.id, "verify_email", user.recoveryEmail);
  const mail = await sendVerificationEmail(user.recoveryEmail, user.firstName, token);
  return { alreadyVerified: false, sent: mail.delivered };
}

export async function verifyEmailToken(token: string) {
  const row = await consumeAuthToken(token, "verify_email");
  if (!row) return null;
  // The token is bound to the address it was sent to; a later change invalidates it.
  const [user] = await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, row.userId), eq(users.recoveryEmail, row.email)))
    .returning({ id: users.id, recoveryEmail: users.recoveryEmail });
  return user ?? null;
}

/** Always resolves the same way so the response does not reveal whether an account exists. */
export async function requestPasswordReset(identifier: string) {
  const id = normalizeAddress(identifier);
  const lookup = id.includes("@") ? id : `${id}@${primaryDomain()}`;
  const [user] = await db
    .select()
    .from(users)
    .where(or(eq(users.address, lookup), eq(users.recoveryEmail, lookup)))
    .limit(1);
  if (!user) return { userId: null };
  if (!user.emailVerifiedAt) {
    logger.info({ userId: user.id }, "password reset requested for unverified recovery email; not sent");
    return { userId: user.id };
  }
  const token = await issueAuthToken(user.id, "reset_password", user.recoveryEmail);
  await sendPasswordResetEmail(user.recoveryEmail, user.firstName, token);
  return { userId: user.id };
}

export async function resetPassword(token: string, newPassword: string) {
  passwordSchema.parse(newPassword);
  const row = await consumeAuthToken(token, "reset_password");
  if (!row) throw badRequest("This reset link is invalid or has expired.");
  const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
  if (!user || user.recoveryEmail !== row.email) throw badRequest("This reset link is invalid or has expired.");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id));
  await invalidateUserSessions(user.id);
  return user;
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionId: string) {
  passwordSchema.parse(newPassword);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthorized();
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw badRequest("Your current password is incorrect.", { field: "currentPassword" });
  }
  if (currentPassword === newPassword) throw badRequest("Choose a password you have not used here.", { field: "newPassword" });
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
  return invalidateUserSessions(userId, keepSessionId);
}

export async function updateRecoveryEmail(userId: string, email: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthorized();
  if (!(await verifyPassword(user.passwordHash, password))) throw badRequest("Your password is incorrect.", { field: "password" });
  const normalized = normalizeAddress(email);
  if (isLocalDomain(domainOf(normalized))) throw badRequest("Use an email address outside Mailed.", { field: "email" });
  try {
    await db.update(users).set({ recoveryEmail: normalized, emailVerifiedAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("An account already uses this recovery email.", { field: "email" });
    throw err;
  }
  const token = await issueAuthToken(userId, "verify_email", normalized);
  const mail = await sendVerificationEmail(normalized, user.firstName, token);
  return { sent: mail.delivered };
}

/** Permanently deletes the account, all mail, and every stored file. */
export async function deleteAccount(userId: string, password: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw unauthorized();
  if (!(await verifyPassword(user.passwordHash, password))) throw badRequest("Your password is incorrect.", { field: "password" });
  await db.delete(users).where(eq(users.id, userId));
  try {
    await storage().deletePrefix(userPrefix(userId));
  } catch (err) {
    logger.error({ err, userId }, "failed to delete stored files for deleted account");
  }
}
