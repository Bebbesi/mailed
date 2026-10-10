import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../db";
import { notifications } from "../db/schema";
import { publishUserEvent } from "../events";

type NotificationType = (typeof notifications.$inferInsert)["type"];

export async function createNotification(
  userId: string,
  data: { type: NotificationType; title: string; body?: string; threadId?: string | null; messageId?: string | null },
  conn: DbOrTx = db,
) {
  const [row] = await conn
    .insert(notifications)
    .values({
      userId,
      type: data.type,
      title: data.title.slice(0, 200),
      body: (data.body ?? "").slice(0, 500),
      threadId: data.threadId ?? null,
      messageId: data.messageId ?? null,
    })
    .returning();
  if (data.type !== "new_mail") {
    await publishUserEvent(userId, { type: "notification", id: row.id, title: row.title, body: row.body, threadId: row.threadId }, conn);
  }
  return row;
}

export async function listNotifications(userId: string, limit = 30) {
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return { items: rows, unread };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  const where = ids?.length
    ? and(eq(notifications.userId, userId), inArray(notifications.id, ids), isNull(notifications.readAt))
    : and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}

export async function clearNotifications(userId: string) {
  await db.delete(notifications).where(eq(notifications.userId, userId));
}
