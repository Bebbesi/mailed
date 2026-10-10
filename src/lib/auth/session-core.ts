import { and, eq, ne, lt } from "drizzle-orm";
import { db } from "../db";
import { sessions, users, type User } from "../db/schema";
import { randomToken, sha256Hex } from "../crypto";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;
const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000;

export type SessionRecord = typeof sessions.$inferSelect;
export type SessionUser = Pick<
  User,
  "id" | "firstName" | "lastName" | "address" | "recoveryEmail" | "emailVerifiedAt" | "avatarKey" | "quotaBytes" | "createdAt"
>;

export type ValidatedSession = { session: SessionRecord; user: SessionUser };

export function sessionIdFromToken(token: string): string {
  return sha256Hex(token);
}

export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<{ token: string; session: SessionRecord }> {
  const token = randomToken(32);
  const [session] = await db
    .insert(sessions)
    .values({
      id: sessionIdFromToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
    })
    .returning();
  return { token, session };
}

export async function validateSessionToken(token: string): Promise<ValidatedSession | null> {
  if (!token || token.length > 128) return null;
  const id = sessionIdFromToken(token);
  const rows = await db
    .select({
      session: sessions,
      user: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        address: users.address,
        recoveryEmail: users.recoveryEmail,
        emailVerifiedAt: users.emailVerifiedAt,
        avatarKey: users.avatarKey,
        quotaBytes: users.quotaBytes,
        createdAt: users.createdAt,
      },
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  const patch: Partial<SessionRecord> = {};
  if (row.session.expiresAt.getTime() - now < RENEW_THRESHOLD_MS) {
    patch.expiresAt = new Date(now + SESSION_TTL_MS);
  }
  if (now - row.session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS) {
    patch.lastSeenAt = new Date(now);
  }
  if (Object.keys(patch).length > 0) {
    await db.update(sessions).set(patch).where(eq(sessions.id, id));
    Object.assign(row.session, patch);
  }
  return row;
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const where = exceptSessionId
    ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
    : eq(sessions.userId, userId);
  const deleted = await db.delete(sessions).where(where).returning({ id: sessions.id });
  return deleted.length;
}

export async function purgeExpiredSessions(): Promise<number> {
  const deleted = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning({ id: sessions.id });
  return deleted.length;
}
