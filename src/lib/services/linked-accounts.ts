import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { labels, linkedAccounts, messages, users, type LinkedAccount } from "../db/schema";
import { encryptSecret } from "../crypto";
import { env, isLocalDomain } from "../env";
import { AppError, badRequest, conflict, isUniqueViolation, notFound, tooManyRequests } from "../errors";
import { publishUserEvent } from "../events";
import { describeConnectionError, forgetAccessToken, linkedConnector, type ConnectionSettings } from "../linked/connect";
import { oauthConfigured } from "../linked/oauth";
import {
  IMAP_PORTS,
  LINKED_PROVIDERS,
  PROVIDER_PRESETS,
  SERVER_SECURITY,
  SMTP_PORTS,
  type LinkedProvider,
  type ServerConfig,
} from "../linked/providers";
import { domainOf, isValidEmail, normalizeAddress } from "../mail/address";
import { hitRateLimit } from "../rate-limit";
import type { LabelColor, LinkedAccountDTO, SenderIdentityDTO } from "../types";

const MAX_ACCOUNTS = 10;

const serverSchema = (ports: readonly number[]) =>
  z.object({
    host: z.string().trim().toLowerCase().min(1, "Enter the server name.").max(253),
    port: z.coerce
      .number()
      .int()
      .refine((p) => ports.includes(p), `Use port ${ports.join(", ")}.`),
    security: z.enum(SERVER_SECURITY),
  });

export const linkedAccountCreateSchema = z.object({
  provider: z.enum(LINKED_PROVIDERS),
  email: z.string().trim().toLowerCase().max(254).refine(isValidEmail, "Enter a valid email address."),
  displayName: z.string().trim().max(80).optional(),
  username: z.string().trim().max(254).optional(),
  password: z.string().min(1, "Enter the password.").max(500),
  imap: serverSchema(IMAP_PORTS).optional(),
  smtp: serverSchema(SMTP_PORTS).optional(),
});

export const linkedAccountPatchSchema = z
  .object({
    displayName: z.string().trim().max(80).nullable(),
    syncEnabled: z.boolean(),
    sendEnabled: z.boolean(),
    password: z.string().min(1).max(500),
  })
  .partial();

const LABEL_COLOR: Record<LinkedProvider, LabelColor> = { gmail: "red", outlook: "blue", yahoo: "violet", icloud: "slate", other: "teal" };

function toDTO(a: LinkedAccount): LinkedAccountDTO {
  return {
    id: a.id,
    provider: a.provider,
    email: a.email,
    displayName: a.displayName,
    authType: a.authType === "password" ? "password" : "oauth",
    syncEnabled: a.syncEnabled,
    sendEnabled: a.sendEnabled,
    status: a.status,
    lastError: a.lastError,
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
    importing: !a.backfillDone,
    labelId: a.labelId,
    imap: { host: a.imapHost, port: a.imapPort, security: a.imapSecurity },
    smtp: { host: a.smtpHost, port: a.smtpPort, security: a.smtpSecurity },
    createdAt: a.createdAt.toISOString(),
  };
}

export async function listLinkedAccounts(userId: string) {
  const rows = await db.select().from(linkedAccounts).where(eq(linkedAccounts.userId, userId)).orderBy(asc(linkedAccounts.createdAt));
  return {
    accounts: rows.map(toDTO),
    oauth: { google: oauthConfigured("google"), microsoft: oauthConfigured("microsoft") },
    importDays: env().LINKED_BACKFILL_DAYS,
  };
}

/** Addresses the user can send from besides their Mailed address. */
export async function senderIdentities(userId: string): Promise<SenderIdentityDTO[]> {
  const rows = await db
    .select({ id: linkedAccounts.id, email: linkedAccounts.email, displayName: linkedAccounts.displayName, provider: linkedAccounts.provider })
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), eq(linkedAccounts.sendEnabled, true)))
    .orderBy(asc(linkedAccounts.createdAt));
  return rows;
}

async function getOwned(userId: string, id: string): Promise<LinkedAccount> {
  if (!z.string().uuid().safeParse(id).success) throw notFound("Account not found.");
  const [a] = await db.select().from(linkedAccounts).where(and(eq(linkedAccounts.id, id), eq(linkedAccounts.userId, userId))).limit(1);
  if (!a) throw notFound("Account not found.");
  return a;
}

/** The account a draft is sent through; it must belong to the user and allow sending. */
export async function getSendingAccount(userId: string, id: string): Promise<LinkedAccount> {
  const a = await getOwned(userId, id);
  if (!a.sendEnabled) throw badRequest(`Sending from ${a.email} is turned off in Settings → Accounts.`);
  return a;
}

async function checkCanLink(userId: string, email: string) {
  const [me] = await db.select({ address: users.address }).from(users).where(eq(users.id, userId)).limit(1);
  if (!me) throw notFound("Account not found.");
  if (email === me.address || isLocalDomain(domainOf(email))) throw badRequest("This address is already part of Mailed.", { field: "email" });
  const [dup] = await db
    .select({ id: linkedAccounts.id })
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), sql`lower(${linkedAccounts.email}) = ${email}`))
    .limit(1);
  if (dup) throw conflict(`${email} is already linked.`, { field: "email" });
  const count = await db.$count(linkedAccounts, eq(linkedAccounts.userId, userId));
  if (count >= MAX_ACCOUNTS) throw conflict(`You can link up to ${MAX_ACCOUNTS} accounts.`);
}

async function limitAttempts(userId: string) {
  const rl = await hitRateLimit(`linked:connect:${userId}`, 10, 3600);
  if (!rl.allowed) throw tooManyRequests(rl.retryAfter, "Too many sign-in attempts. Try again later.");
}

/** Each linked account gets a label so its mail can be viewed on its own. */
async function ensureLabel(userId: string, email: string, provider: LinkedProvider): Promise<string> {
  const name = email.length > 50 ? `${email.slice(0, 49)}…` : email;
  await db.insert(labels).values({ userId, name, color: LABEL_COLOR[provider] }).onConflictDoNothing();
  const [row] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.userId, userId), sql`lower(${labels.name}) = lower(${name})`))
    .limit(1);
  return row.id;
}

async function verifyOrThrow(settings: ConnectionSettings) {
  try {
    await linkedConnector().verify(settings);
  } catch (err) {
    throw describeConnectionError(err, settings);
  }
}

function serversFor(input: z.infer<typeof linkedAccountCreateSchema>): { imap: ServerConfig; smtp: ServerConfig } {
  const preset = PROVIDER_PRESETS[input.provider];
  const imap = input.provider === "other" ? input.imap : preset.imap;
  const smtp = input.provider === "other" ? input.smtp : preset.smtp;
  if (!imap) throw badRequest("Enter the incoming (IMAP) server.", { field: "imap" });
  if (!smtp) throw badRequest("Enter the outgoing (SMTP) server.", { field: "smtp" });
  return { imap, smtp };
}

/** Links an account that signs in with a password (or an app password). */
export async function createPasswordAccount(userId: string, input: z.infer<typeof linkedAccountCreateSchema>) {
  const preset = PROVIDER_PRESETS[input.provider];
  if (!preset.passwordSupported) {
    throw new AppError(400, "oauth_required", `${preset.name} no longer accepts passwords from other apps. Use “Sign in with Microsoft”.`);
  }
  const email = normalizeAddress(input.email);
  await checkCanLink(userId, email);
  await limitAttempts(userId);
  // Google shows app passwords in groups of four ("abcd efgh …").
  const password = input.provider === "gmail" ? input.password.replace(/\s+/g, "") : input.password;
  const { imap, smtp } = serversFor(input);
  const username = input.username?.trim() || email;
  await verifyOrThrow({ email, username, auth: { type: "password", password }, imap, smtp });

  const labelId = await ensureLabel(userId, email, input.provider);
  try {
    const [row] = await db
      .insert(linkedAccounts)
      .values({
        userId,
        provider: input.provider,
        email,
        displayName: input.displayName || null,
        authType: "password",
        username,
        secret: encryptSecret(env().APP_SECRET, password),
        imapHost: imap.host,
        imapPort: imap.port,
        imapSecurity: imap.security,
        smtpHost: smtp.host,
        smtpPort: smtp.port,
        smtpSecurity: smtp.security,
        labelId,
      })
      .returning();
    return toDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`${email} is already linked.`, { field: "email" });
    throw err;
  }
}

/** Links (or reconnects) an account after the provider's consent screen. */
export async function connectOAuthAccount(
  userId: string,
  oauthProvider: "google" | "microsoft",
  result: { provider: LinkedProvider; email: string; name: string | null; refreshToken: string; accessToken: string },
) {
  const preset = PROVIDER_PRESETS[result.provider];
  const email = normalizeAddress(result.email);
  const secret = encryptSecret(env().APP_SECRET, result.refreshToken);
  const [existing] = await db
    .select()
    .from(linkedAccounts)
    .where(and(eq(linkedAccounts.userId, userId), sql`lower(${linkedAccounts.email}) = ${email}`))
    .limit(1);
  if (existing) {
    forgetAccessToken(existing.id);
    const [row] = await db
      .update(linkedAccounts)
      .set({
        authType: oauthProvider === "google" ? "oauth_google" : "oauth_microsoft",
        username: email,
        secret,
        status: "active",
        lastError: null,
        consecutiveFailures: 0,
        nextSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(linkedAccounts.id, existing.id))
      .returning();
    return toDTO(row);
  }

  await checkCanLink(userId, email);
  const imap = preset.imap!;
  const smtp = preset.smtp!;
  await verifyOrThrow({ email, username: email, auth: { type: "oauth", accessToken: result.accessToken }, imap, smtp });
  const labelId = await ensureLabel(userId, email, result.provider);
  const [row] = await db
    .insert(linkedAccounts)
    .values({
      userId,
      provider: result.provider,
      email,
      displayName: result.name,
      authType: oauthProvider === "google" ? "oauth_google" : "oauth_microsoft",
      username: email,
      secret,
      imapHost: imap.host,
      imapPort: imap.port,
      imapSecurity: imap.security,
      smtpHost: smtp.host,
      smtpPort: smtp.port,
      smtpSecurity: smtp.security,
      labelId,
    })
    .returning();
  return toDTO(row);
}

export async function updateLinkedAccount(userId: string, id: string, patch: z.infer<typeof linkedAccountPatchSchema>) {
  const a = await getOwned(userId, id);
  const set: Partial<typeof linkedAccounts.$inferInsert> = { updatedAt: new Date() };
  if (patch.displayName !== undefined) set.displayName = patch.displayName || null;
  if (patch.sendEnabled !== undefined) set.sendEnabled = patch.sendEnabled;
  if (patch.syncEnabled !== undefined) {
    set.syncEnabled = patch.syncEnabled;
    if (patch.syncEnabled) set.nextSyncAt = new Date();
  }
  if (patch.password !== undefined) {
    if (a.authType !== "password") throw badRequest("This account signs in with its provider; reconnect it instead.");
    await limitAttempts(userId);
    const password = a.provider === "gmail" ? patch.password.replace(/\s+/g, "") : patch.password;
    await verifyOrThrow({
      email: a.email,
      username: a.username,
      auth: { type: "password", password },
      imap: { host: a.imapHost, port: a.imapPort, security: a.imapSecurity },
      smtp: { host: a.smtpHost, port: a.smtpPort, security: a.smtpSecurity },
    });
    Object.assign(set, { secret: encryptSecret(env().APP_SECRET, password), status: "active", lastError: null, consecutiveFailures: 0, nextSyncAt: new Date() });
  }
  const [row] = await db.update(linkedAccounts).set(set).where(eq(linkedAccounts.id, a.id)).returning();
  return toDTO(row);
}

export async function requestLinkedSync(userId: string, id: string) {
  const a = await getOwned(userId, id);
  if (a.status === "auth_error") throw badRequest("Reconnect the account first.");
  await db.update(linkedAccounts).set({ nextSyncAt: new Date(), syncEnabled: true }).where(eq(linkedAccounts.id, a.id));
  return { ok: true };
}

/** Unlinks an account; optionally deletes the mail fetched from it and its label. */
export async function removeLinkedAccount(userId: string, id: string, opts: { deleteMail: boolean }) {
  const a = await getOwned(userId, id);
  forgetAccessToken(a.id);
  let deleted = 0;
  if (opts.deleteMail) {
    const { purgeMessages } = await import("./actions");
    for (;;) {
      const batch = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.userId, userId), eq(messages.linkedAccountId, a.id)))
        .limit(500);
      if (batch.length === 0) break;
      deleted += await purgeMessages(userId, batch.map((m) => m.id));
    }
  }
  await db.delete(linkedAccounts).where(eq(linkedAccounts.id, a.id));
  if (opts.deleteMail && a.labelId) await db.delete(labels).where(and(eq(labels.id, a.labelId), eq(labels.userId, userId)));
  await publishUserEvent(userId, { type: "mail.changed" });
  return { deleted };
}
