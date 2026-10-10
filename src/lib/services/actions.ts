import { and, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  attachments,
  domainReputation,
  labels,
  messageLabels,
  messages,
  senderCategories,
  senderLists,
  threads,
  type Message,
} from "../db/schema";
import { badRequest, notFound } from "../errors";
import { publishUserEvent } from "../events";
import { trainBayes, tokenize } from "../classify/bayes";
import { analyzeHtml, extractTextLinks } from "../mail/sanitize";
import { registrableDomain, domainOf } from "../mail/address";
import { storage } from "../storage";
import { logger } from "../logger";
import { CATEGORIES } from "../types";
import { ownedScope } from "./mailbox";

const uuid = z.string().uuid();

export const actionSchema = z.object({
  threadIds: z.array(uuid).max(500).optional(),
  messageIds: z.array(uuid).max(500).optional(),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("archive") }),
    z.object({ type: z.literal("move_to_inbox") }),
    z.object({ type: z.literal("trash") }),
    z.object({ type: z.literal("delete_forever") }),
    z.object({ type: z.literal("spam") }),
    z.object({ type: z.literal("not_spam") }),
    z.object({ type: z.literal("mark_read") }),
    z.object({ type: z.literal("mark_unread") }),
    z.object({ type: z.literal("star") }),
    z.object({ type: z.literal("unstar") }),
    z.object({ type: z.literal("important") }),
    z.object({ type: z.literal("not_important") }),
    z.object({ type: z.literal("snooze"), until: z.string().datetime() }),
    z.object({ type: z.literal("unsnooze") }),
    z.object({ type: z.literal("add_label"), labelId: uuid }),
    z.object({ type: z.literal("remove_label"), labelId: uuid }),
    z.object({ type: z.literal("set_category"), category: z.enum(CATEGORIES) }),
    z.object({ type: z.literal("block_sender") }),
  ]),
});

export type ActionRequest = z.infer<typeof actionSchema>;

function trainingTokens(m: Message): string[] {
  const links = m.htmlBody ? analyzeHtml(m.htmlBody).links : extractTextLinks(m.textBody);
  const domains = [
    ...new Set(
      links
        .map((l) => {
          try {
            return registrableDomain(new URL(l.href).hostname);
          } catch {
            return null;
          }
        })
        .filter((d): d is string => Boolean(d)),
    ),
  ];
  return tokenize({ subject: m.subject, text: m.textBody, fromAddress: m.fromAddress, linkDomains: domains, flags: [] });
}

async function learnSpam(userId: string, rows: Message[], label: "spam" | "ham") {
  for (const m of rows) {
    if (m.direction !== "inbound") continue;
    const previous = m.classification?.trainedAs;
    if (previous === label) continue;
    try {
      await trainBayes(userId, trainingTokens(m), label, previous);
      if (m.classification) {
        await db
          .update(messages)
          .set({ classification: { ...m.classification, trainedAs: label } })
          .where(eq(messages.id, m.id));
      }
      const domain = registrableDomain(domainOf(m.fromAddress) || "unknown.invalid");
      await db
        .insert(domainReputation)
        .values({ domain, spamReports: label === "spam" ? 1 : 0, hamReports: label === "ham" ? 1 : 0 })
        .onConflictDoUpdate({
          target: domainReputation.domain,
          set:
            label === "spam"
              ? { spamReports: sql`${domainReputation.spamReports} + 1` }
              : { hamReports: sql`${domainReputation.hamReports} + 1` },
        });
    } catch (err) {
      logger.warn({ err }, "classifier training failed");
    }
  }
}

/** Deletes rows and the stored files that belong to them. */
export async function purgeMessages(userId: string, ids: string[]) {
  if (ids.length === 0) return 0;
  const owned = await db
    .select({ id: messages.id, rawKey: messages.rawKey, threadId: messages.threadId })
    .from(messages)
    .where(and(eq(messages.userId, userId), inArray(messages.id, ids)));
  if (owned.length === 0) return 0;
  const ownedIds = owned.map((m) => m.id);
  const atts = await db
    .select({ key: attachments.storageKey })
    .from(attachments)
    .where(and(eq(attachments.userId, userId), inArray(attachments.messageId, ownedIds)));
  await db.delete(messages).where(and(eq(messages.userId, userId), inArray(messages.id, ownedIds)));
  const threadIds = [...new Set(owned.map((m) => m.threadId))];
  await db.execute(sql`
    delete from threads t where t.user_id = ${userId} and t.id in ${threadIds}
      and not exists (select 1 from messages m where m.thread_id = t.id)
  `);
  const keys = [...owned.map((m) => m.rawKey).filter((k): k is string => Boolean(k)), ...atts.map((a) => a.key)];
  await Promise.all(keys.map((k) => storage().delete(k).catch((err) => logger.warn({ err }, "failed to delete stored file"))));
  return ownedIds.length;
}

export async function applyAction(userId: string, req: ActionRequest): Promise<{ affected: number }> {
  if (!req.threadIds?.length && !req.messageIds?.length) throw badRequest("Select at least one conversation.");
  const scope = ownedScope(userId, req);
  const now = new Date();
  const a = req.action;
  let affected = 0;

  const update = async (set: Partial<typeof messages.$inferInsert>, extra?: ReturnType<typeof sql>) => {
    const rows = await db
      .update(messages)
      .set({ ...set, updatedAt: now })
      .where(extra ? and(scope, extra) : scope)
      .returning({ id: messages.id });
    affected += rows.length;
    return rows;
  };

  switch (a.type) {
    case "archive":
      await update({ folder: "archive", snoozedUntil: null }, sql`${messages.folder} = 'inbox'`);
      break;
    case "move_to_inbox": {
      const rows = await db.select().from(messages).where(and(scope, inArray(messages.folder, ["archive", "spam", "trash"])));
      const fromSpam = rows.filter((m) => m.folder === "spam");
      for (const m of rows) {
        const target = m.restoreFolder && m.restoreFolder !== "spam" && m.restoreFolder !== "trash" ? m.restoreFolder : m.direction === "inbound" ? "inbox" : m.sendStatus === "draft" ? "drafts" : "sent";
        await db
          .update(messages)
          .set({ folder: m.folder === "archive" && m.direction === "inbound" ? "inbox" : target, restoreFolder: null, trashedAt: null, updatedAt: now })
          .where(eq(messages.id, m.id));
        affected++;
      }
      if (fromSpam.length) await learnSpam(userId, fromSpam, "ham");
      break;
    }
    case "trash":
      await db.execute(sql`
        update messages set restore_folder = folder, folder = 'trash', trashed_at = ${now.toISOString()}, snoozed_until = null, updated_at = now()
        where ${scope} and folder <> 'trash'
      `);
      affected = (await db.select({ c: sql<number>`count(*)::int` }).from(messages).where(and(scope, eq(messages.folder, "trash"))))[0].c;
      // Scheduled or queued sends are cancelled when trashed.
      await db.execute(sql`
        delete from jobs where status = 'pending' and unique_key in (
          select 'send:' || id from messages where ${scope} and send_status in ('scheduled', 'queued'))
      `);
      await db
        .update(messages)
        .set({ sendStatus: "draft", scheduledAt: null })
        .where(and(scope, inArray(messages.sendStatus, ["scheduled", "queued"])));
      break;
    case "delete_forever": {
      const ids = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(scope, inArray(messages.folder, ["trash", "spam"])));
      affected = await purgeMessages(userId, ids.map((r) => r.id));
      break;
    }
    case "spam": {
      const rows = await db.select().from(messages).where(and(scope, notInArray(messages.folder, ["spam", "drafts"])));
      if (rows.length) {
        await db.execute(sql`
          update messages set restore_folder = folder, folder = 'spam', snoozed_until = null, updated_at = now()
          where ${scope} and folder not in ('spam', 'drafts')
        `);
        affected = rows.length;
        await learnSpam(userId, rows, "spam");
      }
      break;
    }
    case "not_spam": {
      const rows = await db.select().from(messages).where(and(scope, eq(messages.folder, "spam")));
      for (const m of rows) {
        const target = m.restoreFolder && m.restoreFolder !== "spam" && m.restoreFolder !== "trash" ? m.restoreFolder : m.direction === "inbound" ? "inbox" : "sent";
        await db.update(messages).set({ folder: target, restoreFolder: null, updatedAt: now }).where(eq(messages.id, m.id));
      }
      affected = rows.length;
      await learnSpam(userId, rows, "ham");
      break;
    }
    case "mark_read":
      await update({ isRead: true }, sql`not ${messages.isRead}`);
      break;
    case "mark_unread": {
      if (req.messageIds?.length) {
        await update({ isRead: false });
      } else {
        // Thread scope: mark the latest message unread, like most mail clients.
        const latest = await db.execute<{ id: string }>(sql`
          select distinct on (thread_id) id from messages where ${scope} and folder not in ('trash', 'drafts')
          order by thread_id, date desc
        `);
        if (latest.length) {
          const rows = await db.update(messages).set({ isRead: false, updatedAt: now }).where(inArray(messages.id, latest.map((r) => r.id))).returning({ id: messages.id });
          affected = rows.length;
        }
      }
      break;
    }
    case "star": {
      if (req.messageIds?.length) {
        await update({ isStarred: true });
      } else {
        const latest = await db
          .select({ id: messages.id, threadId: messages.threadId })
          .from(messages)
          .where(and(scope, notInArray(messages.folder, ["trash", "drafts"])))
          .orderBy(desc(messages.date));
        const seen = new Set<string>();
        const ids = latest.filter((m) => (seen.has(m.threadId) ? false : (seen.add(m.threadId), true))).map((m) => m.id);
        if (ids.length) {
          const rows = await db.update(messages).set({ isStarred: true, updatedAt: now }).where(inArray(messages.id, ids)).returning({ id: messages.id });
          affected = rows.length;
        }
      }
      break;
    }
    case "unstar":
      await update({ isStarred: false });
      break;
    case "important":
      await update({ isImportant: true });
      break;
    case "not_important":
      await update({ isImportant: false });
      break;
    case "snooze": {
      const until = new Date(a.until);
      if (until.getTime() <= Date.now() + 30_000) throw badRequest("Choose a time in the future.");
      if (until.getTime() > Date.now() + 366 * 86400_000) throw badRequest("Snooze for at most one year.");
      await update({ snoozedUntil: until, folder: "inbox" }, sql`${messages.folder} in ('inbox', 'archive') and ${messages.direction} = 'inbound'`);
      if (affected === 0) throw badRequest("Only received conversations can be snoozed.");
      break;
    }
    case "unsnooze":
      await update({ snoozedUntil: null, sortDate: now }, sql`${messages.snoozedUntil} is not null`);
      break;
    case "add_label":
    case "remove_label": {
      const [label] = await db.select().from(labels).where(and(eq(labels.id, a.labelId), eq(labels.userId, userId))).limit(1);
      if (!label) throw notFound("Label not found.");
      const rows = await db.select({ id: messages.id }).from(messages).where(and(scope, sql`${messages.folder} <> 'trash'`));
      if (rows.length === 0) break;
      if (a.type === "add_label") {
        await db
          .insert(messageLabels)
          .values(rows.map((r) => ({ messageId: r.id, labelId: label.id, userId })))
          .onConflictDoNothing();
      } else {
        await db
          .delete(messageLabels)
          .where(and(eq(messageLabels.userId, userId), eq(messageLabels.labelId, label.id), inArray(messageLabels.messageId, rows.map((r) => r.id))));
      }
      affected = rows.length;
      break;
    }
    case "set_category": {
      const rows = await db
        .select({ id: messages.id, fromAddress: messages.fromAddress, classification: messages.classification })
        .from(messages)
        .where(and(scope, eq(messages.direction, "inbound")));
      for (const m of rows) {
        await db
          .update(messages)
          .set({
            category: a.category,
            updatedAt: now,
            classification: m.classification
              ? { ...m.classification, category: { ...m.classification.category, value: a.category, source: "user", reasons: ["You moved this conversation here"] } }
              : null,
          })
          .where(eq(messages.id, m.id));
      }
      // Learn: future mail from these senders goes to the same category.
      const senders = [...new Set(rows.map((r) => r.fromAddress).filter(Boolean))];
      if (senders.length) {
        await db
          .insert(senderCategories)
          .values(senders.map((s) => ({ userId, pattern: s, category: a.category })))
          .onConflictDoUpdate({ target: [senderCategories.userId, senderCategories.pattern], set: { category: a.category, updatedAt: now } });
      }
      affected = rows.length;
      break;
    }
    case "block_sender": {
      const rows = await db.select().from(messages).where(and(scope, eq(messages.direction, "inbound")));
      const senders = [...new Set(rows.map((r) => r.fromAddress).filter(Boolean))];
      if (senders.length) {
        await db
          .insert(senderLists)
          .values(senders.map((s) => ({ userId, kind: "blocked" as const, pattern: s })))
          .onConflictDoUpdate({ target: [senderLists.userId, senderLists.pattern], set: { kind: "blocked" } });
        await db.execute(sql`
          update messages set restore_folder = folder, folder = 'spam', updated_at = now()
          where user_id = ${userId} and direction = 'inbound' and from_address in ${senders} and folder not in ('spam', 'trash')
        `);
        await learnSpam(userId, rows, "spam");
      }
      affected = rows.length;
      break;
    }
  }

  if (affected > 0) {
    const touched = req.threadIds ?? [];
    await publishUserEvent(userId, { type: "mail.changed", threadIds: touched.slice(0, 50) });
  }
  return { affected };
}

/** Permanently removes everything in Trash. */
export async function emptyFolder(userId: string, folder: "trash" | "spam") {
  let total = 0;
  for (;;) {
    const batch = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.folder, folder)))
      .limit(500);
    if (batch.length === 0) break;
    total += await purgeMessages(userId, batch.map((b) => b.id));
  }
  await publishUserEvent(userId, { type: "mail.changed" });
  return total;
}

export async function threadExists(userId: string, threadId: string) {
  const [t] = await db.select({ id: threads.id }).from(threads).where(and(eq(threads.id, threadId), eq(threads.userId, userId))).limit(1);
  return Boolean(t);
}
