import { and, eq, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { messages, notifications, reminders } from "../db/schema";
import { env } from "../env";
import { publishUserEvent } from "../events";
import { logger } from "../logger";
import { purgeExpiredSessions } from "../auth/session-core";
import { purgeRateLimits } from "../rate-limit";
import { purgeOldJobs, recoverStaleJobs } from "../jobs";
import { createNotification } from "./notifications";
import { purgeMessages } from "./actions";

/** Returns snoozed conversations to the inbox when their time comes. */
export async function wakeSnoozed() {
  const rows = await db
    .update(messages)
    .set({ snoozedUntil: null, sortDate: new Date(), isRead: false, folder: "inbox", updatedAt: new Date() })
    .where(and(lte(messages.snoozedUntil, new Date()), sql`${messages.folder} not in ('trash', 'spam')`))
    .returning({ userId: messages.userId, threadId: messages.threadId, subject: messages.subject, fromName: messages.fromName, fromAddress: messages.fromAddress });
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.userId}:${r.threadId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    await createNotification(r.userId, {
      type: "reminder",
      title: "Snoozed conversation is back",
      body: `${r.fromName || r.fromAddress}: ${r.subject || "(no subject)"}`,
      threadId: r.threadId,
    });
    await publishUserEvent(r.userId, { type: "mail.changed", threadIds: [r.threadId] });
  }
  if (rows.length) logger.info({ count: seen.size }, "snoozed conversations returned");
}

/** Fires due follow-up reminders, skipping "if no reply" reminders that got a reply. */
export async function fireReminders() {
  const due = await db
    .select({ r: reminders, m: { date: messages.date, subject: messages.subject, direction: messages.direction } })
    .from(reminders)
    .innerJoin(messages, eq(messages.id, reminders.messageId))
    .where(and(isNull(reminders.firedAt), lte(reminders.remindAt, new Date())))
    .limit(200);
  for (const { r, m } of due) {
    await db.update(reminders).set({ firedAt: new Date() }).where(eq(reminders.id, r.id));
    if (r.onlyIfNoReply) {
      const [reply] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.threadId, r.threadId), eq(messages.direction, "inbound"), sql`${messages.date} > ${m.date.toISOString()}`))
        .limit(1);
      if (reply) continue;
    }
    // Bring the conversation back to the top of the inbox.
    await db
      .update(messages)
      .set({ sortDate: new Date(), folder: sql`case when ${messages.folder} = 'archive' then 'inbox'::folder else ${messages.folder} end`, updatedAt: new Date() })
      .where(eq(messages.id, r.messageId));
    await createNotification(r.userId, {
      type: "reminder",
      title: r.onlyIfNoReply ? "No reply yet" : "Reminder",
      body: `${r.note ? `${r.note} — ` : ""}${m.subject || "(no subject)"}`,
      threadId: r.threadId,
      messageId: r.messageId,
    });
    await publishUserEvent(r.userId, { type: "mail.changed", threadIds: [r.threadId] });
  }
}

/** Deletes messages that stayed in Trash or Spam past the retention period. */
export async function purgeRetention() {
  const trashCutoff = new Date(Date.now() - env().TRASH_RETENTION_DAYS * 86400_000);
  const spamCutoff = new Date(Date.now() - env().SPAM_RETENTION_DAYS * 86400_000);
  for (;;) {
    const batch = await db
      .select({ id: messages.id, userId: messages.userId })
      .from(messages)
      .where(
        sql`(${messages.folder} = 'trash' and ${messages.trashedAt} < ${trashCutoff.toISOString()}) or (${messages.folder} = 'spam' and ${messages.updatedAt} < ${spamCutoff.toISOString()})`,
      )
      .limit(500);
    if (batch.length === 0) break;
    const byUser = new Map<string, string[]>();
    for (const b of batch) byUser.set(b.userId, [...(byUser.get(b.userId) ?? []), b.id]);
    for (const [userId, ids] of byUser) await purgeMessages(userId, ids);
    logger.info({ count: batch.length }, "retention purge");
  }
}

export async function housekeeping() {
  await Promise.all([
    purgeExpiredSessions(),
    purgeRateLimits(),
    purgeOldJobs(),
    recoverStaleJobs(),
    db.delete(notifications).where(lt(notifications.createdAt, new Date(Date.now() - 90 * 86400_000))),
    db.delete(reminders).where(and(lt(reminders.firedAt, new Date(Date.now() - 30 * 86400_000)))),
  ]);
}

