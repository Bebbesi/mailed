import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { simpleParser } from "mailparser";
import { db } from "../db";
import { messages } from "../db/schema";
import { logger } from "../logger";
import { storage } from "../storage";
import { PARSE_OPTIONS } from "./ingest";
import { referencesRemoteContent, sanitizeEmailHtml } from "./sanitize";

/**
 * Rebuilds the stored, sanitised HTML of received messages from their original
 * source. Run after changing the sanitiser so existing mail benefits too.
 */
export async function rerenderStoredHtml(opts: { userId?: string; batch?: number; onProgress?: (done: number) => void } = {}) {
  const batch = opts.batch ?? 200;
  let cursor = "00000000-0000-0000-0000-000000000000";
  let checked = 0;
  let updated = 0;
  let failed = 0;
  for (;;) {
    const rows = await db
      .select({ id: messages.id, rawKey: messages.rawKey, htmlBody: messages.htmlBody, hasRemoteContent: messages.hasRemoteContent })
      .from(messages)
      .where(
        and(
          eq(messages.direction, "inbound"),
          isNotNull(messages.rawKey),
          gt(messages.id, cursor),
          opts.userId ? eq(messages.userId, opts.userId) : undefined,
        ),
      )
      .orderBy(asc(messages.id))
      .limit(batch);
    if (rows.length === 0) break;
    for (const row of rows) {
      cursor = row.id;
      checked++;
      try {
        const parsed = await simpleParser(await storage().get(row.rawKey!), PARSE_OPTIONS);
        const raw = typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : null;
        const html = raw ? sanitizeEmailHtml(raw) : null;
        const remote = html ? referencesRemoteContent(html) : false;
        if (html !== row.htmlBody || remote !== row.hasRemoteContent) {
          await db.update(messages).set({ htmlBody: html, hasRemoteContent: remote }).where(eq(messages.id, row.id));
          updated++;
        }
      } catch (err) {
        failed++;
        // Query errors embed their parameters (the message body), so only the cause is logged.
        const e = err as Error & { cause?: Error };
        logger.warn({ messageId: row.id, err: (e.cause?.message ?? e.message).slice(0, 200) }, "could not re-render message HTML");
      }
    }
    opts.onProgress?.(checked);
  }
  return { checked, updated, failed };
}
