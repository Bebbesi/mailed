import { and, asc, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { contacts, emailRules, labels, messages, senderLists, users } from "../db/schema";
import { logger } from "../logger";
import { ingestRawMessage, IngestError } from "../mail/ingest";
import { storage } from "../storage";
import { getSettings } from "./settings";
import { createNotification } from "./notifications";

/** Personal data other than message contents, as JSON (GDPR Art. 20). */
export async function exportAccountJson(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [lbls, cts, lists, rules, settings] = await Promise.all([
    db.select({ name: labels.name, color: labels.color }).from(labels).where(eq(labels.userId, userId)),
    db
      .select({ name: contacts.name, address: contacts.address, isFavorite: contacts.isFavorite, notes: contacts.notes })
      .from(contacts)
      .where(eq(contacts.userId, userId)),
    db.select({ kind: senderLists.kind, pattern: senderLists.pattern }).from(senderLists).where(eq(senderLists.userId, userId)),
    db
      .select({ name: emailRules.name, enabled: emailRules.enabled, match: emailRules.match, conditions: emailRules.conditions, actions: emailRules.actions })
      .from(emailRules)
      .where(eq(emailRules.userId, userId)),
    getSettings(userId),
  ]);
  return {
    format: "mailed-account-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      firstName: u.firstName,
      lastName: u.lastName,
      address: u.address,
      recoveryEmail: u.recoveryEmail,
      createdAt: u.createdAt.toISOString(),
    },
    settings,
    labels: lbls,
    contacts: cts,
    senderLists: lists,
    filters: rules,
  };
}

function mboxFromLine(from: string, date: Date) {
  const d = date.toUTCString().replace(/^(\w+), (\d+) (\w+) (\d+) ([\d:]+) GMT$/, "$1 $3 $2 $5 $4");
  return `From ${from || "MAILER-DAEMON"} ${d}\n`;
}

/** Streams every stored message as an mboxrd file. */
export function exportMailboxStream(userId: string): ReadableStream<Uint8Array> {
  let lastId: string | null = null;
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const batch = await db
          .select({ id: messages.id, rawKey: messages.rawKey, fromAddress: messages.fromAddress, date: messages.date })
          .from(messages)
          .where(lastId ? and(eq(messages.userId, userId), gt(messages.id, lastId)) : eq(messages.userId, userId))
          .orderBy(asc(messages.id))
          .limit(50);
        if (batch.length === 0) {
          controller.close();
          return;
        }
        for (const m of batch) {
          if (!m.rawKey) continue;
          let raw: Buffer;
          try {
            raw = await storage().get(m.rawKey);
          } catch {
            continue;
          }
          const body = raw.toString("latin1").replace(/\r\n/g, "\n").replace(/^(>*From )/gm, ">$1");
          controller.enqueue(encoder.encode(mboxFromLine(m.fromAddress, m.date)));
          controller.enqueue(Buffer.from(body.endsWith("\n") ? `${body}\n` : `${body}\n\n`, "latin1"));
        }
        lastId = batch[batch.length - 1].id;
      } catch (err) {
        logger.error({ err, userId }, "mailbox export failed");
        controller.error(err);
      }
    },
  });
}

/** Splits an mbox (mboxo or mboxrd) into raw messages. */
export function splitMbox(data: Buffer): Buffer[] {
  const text = data.toString("latin1");
  if (!text.startsWith("From ")) return [data];
  const parts = text.split(/\r?\n(?=From [^\r\n]*\r?\n)/);
  return parts
    .map((p) => p.replace(/^From [^\r\n]*\r?\n/, "").replace(/^>(>*From )/gm, "$1"))
    .filter((p) => p.trim().length > 0)
    .map((p) => Buffer.from(p, "latin1"));
}

/** Imports an uploaded .mbox/.eml file stored at `key` into the user's mailbox. */
export async function runImport(userId: string, key: string, folder: "inbox" | "archive") {
  const data = await storage().get(key);
  const items = splitMbox(data).slice(0, 10_000);
  let imported = 0;
  let duplicates = 0;
  let failed = 0;
  for (const raw of items) {
    try {
      const res = await ingestRawMessage(raw, { source: "import", targetUserIds: [userId], importFolder: folder });
      if (res.delivered.some((d) => d.duplicate)) duplicates++;
      else if (res.delivered.length) imported++;
      else failed++;
    } catch (err) {
      failed++;
      if (!(err instanceof IngestError)) logger.warn({ err }, "import of a message failed");
    }
  }
  await storage().delete(key).catch(() => undefined);
  await createNotification(userId, {
    type: "system",
    title: "Import finished",
    body: `${imported} imported, ${duplicates} already present, ${failed} could not be read.`,
  });
  return { imported, duplicates, failed };
}
