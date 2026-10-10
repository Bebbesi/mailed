import { sql } from "drizzle-orm";
import { db, type DbOrTx } from "./db";
import { logger } from "./logger";

export const EVENTS_CHANNEL = "mailed_events";

export type MailboxEvent =
  | { type: "mail.new"; threadId: string; messageId: string; notify: boolean; title?: string; body?: string; category?: string }
  | { type: "mail.changed"; threadIds?: string[] }
  | { type: "send.status"; messageId: string; threadId: string; status: string; error?: string | null }
  | { type: "notification"; id: string; title: string; body: string; threadId?: string | null };

/**
 * Publishes an event for a user's open sessions via PostgreSQL NOTIFY. When
 * called inside a transaction, delivery happens on commit.
 */
export async function publishUserEvent(userId: string, event: MailboxEvent, conn: DbOrTx = db) {
  const payload = JSON.stringify({ u: userId, e: event });
  if (Buffer.byteLength(payload) > 7900) {
    logger.warn({ type: event.type }, "event payload too large, dropping details");
    return;
  }
  try {
    await conn.execute(sql`select pg_notify(${EVENTS_CHANNEL}, ${payload})`);
  } catch (err) {
    logger.warn({ err }, "failed to publish event");
  }
}
