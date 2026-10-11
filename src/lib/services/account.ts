import { and, desc, eq, ne } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { db } from "../db";
import { securityEvents, sessions, users } from "../db/schema";
import { env, outboundConfigured } from "../env";
import { badRequest, notFound, payloadTooLarge } from "../errors";
import { mailboxUsage } from "../mail/ingest";
import { senderIdentities } from "./linked-accounts";
import { storage, userPrefix } from "../storage";
import type { MeDTO } from "../types";

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "Required.").max(60),
  lastName: z.string().trim().min(1, "Required.").max(60),
});

export async function getMe(userId: string): Promise<MeDTO> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw notFound("Account not found.");
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    address: u.address,
    recoveryEmail: u.recoveryEmail,
    emailVerified: Boolean(u.emailVerifiedAt),
    avatarUrl: u.avatarKey ? `/api/me/avatar?v=${encodeURIComponent(u.avatarKey.slice(-12))}` : null,
    createdAt: u.createdAt.toISOString(),
    storage: { usedBytes: await mailboxUsage(u.id), quotaBytes: u.quotaBytes },
    mail: { outboundConfigured: outboundConfigured(), domains: env().MAIL_DOMAINS },
    senders: await senderIdentities(u.id),
  };
}

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, userId));
  return getMe(userId);
}

const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function setAvatar(userId: string, data: Buffer) {
  if (data.length > 2 * 1024 * 1024) throw payloadTooLarge("Images can be at most 2 MB.");
  const type = await fileTypeFromBuffer(data);
  if (!type || !AVATAR_TYPES.has(type.mime)) throw badRequest("Use a PNG, JPEG, WebP or GIF image.");
  const [u] = await db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, userId)).limit(1);
  const key = `${userPrefix(userId)}avatar/${crypto.randomUUID()}`;
  await storage().put(key, data, type.mime);
  await db.update(users).set({ avatarKey: key, updatedAt: new Date() }).where(eq(users.id, userId));
  if (u?.avatarKey) await storage().delete(u.avatarKey).catch(() => undefined);
  return getMe(userId);
}

export async function removeAvatar(userId: string) {
  const [u] = await db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, userId)).limit(1);
  await db.update(users).set({ avatarKey: null, updatedAt: new Date() }).where(eq(users.id, userId));
  if (u?.avatarKey) await storage().delete(u.avatarKey).catch(() => undefined);
}

export async function readAvatar(userId: string) {
  const [u] = await db.select({ avatarKey: users.avatarKey }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.avatarKey) throw notFound();
  const data = await storage().get(u.avatarKey);
  const type = await fileTypeFromBuffer(data);
  return { data, contentType: type?.mime ?? "application/octet-stream" };
}

export async function listSessions(userId: string, currentId: string) {
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastSeenAt));
  return rows.map((s) => ({
    id: s.id,
    current: s.id === currentId,
    createdAt: s.createdAt.toISOString(),
    lastSeenAt: s.lastSeenAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ip: s.ip,
    userAgent: s.userAgent,
  }));
}

export async function revokeSession(userId: string, sessionId: string, currentId: string) {
  if (sessionId === currentId) throw badRequest("Use Sign out to end the current session.");
  const rows = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), ne(sessions.id, currentId)))
    .returning({ id: sessions.id });
  if (rows.length === 0) throw notFound("Session not found.");
}

export async function listSecurityEvents(userId: string, limit = 50) {
  const rows = await db
    .select()
    .from(securityEvents)
    .where(eq(securityEvents.userId, userId))
    .orderBy(desc(securityEvents.createdAt))
    .limit(limit);
  return rows.map((e) => ({ id: e.id, type: e.type, ip: e.ip, userAgent: e.userAgent, createdAt: e.createdAt.toISOString() }));
}
