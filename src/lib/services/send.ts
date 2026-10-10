import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { attachments, messageRecipients, messages, userSettings, users } from "../db/schema";
import { env, isLocalDomain } from "../env";
import { PermanentJobError } from "../jobs";
import { logger } from "../logger";
import { publishUserEvent } from "../events";
import { domainOf } from "../mail/address";
import { buildMime } from "../mail/compose";
import { ingestRawMessage, IngestError } from "../mail/ingest";
import { htmlToText, makeSnippet } from "../mail/sanitize";
import { getOutboundTransport, TransportError } from "../mail/transport";
import { storage, userPrefix } from "../storage";
import { createNotification } from "./notifications";
import { recordOutgoingContacts } from "./contacts";

async function markFailed(m: { id: string; userId: string; threadId: string; subject: string }, error: string) {
  await db.update(messages).set({ sendStatus: "failed", sendError: error.slice(0, 1000), updatedAt: new Date() }).where(eq(messages.id, m.id));
  await createNotification(m.userId, {
    type: "send_failed",
    title: "Message not sent",
    body: `"${m.subject || "(no subject)"}": ${error}`.slice(0, 500),
    threadId: m.threadId,
    messageId: m.id,
  });
  await publishUserEvent(m.userId, { type: "send.status", messageId: m.id, threadId: m.threadId, status: "failed", error });
}

/**
 * Delivers a queued message: local mailboxes directly, everyone else through
 * the configured provider. Temporary provider errors throw so the job is
 * retried with backoff; local re-delivery on retry is deduplicated.
 */
export async function processSendJob(payload: { messageId?: string }, attempt: number, maxAttempts: number) {
  const id = payload.messageId;
  if (!id) throw new PermanentJobError("Missing messageId");
  const [m] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);
  if (!m) return; // discarded meanwhile
  if (m.sendStatus !== "queued" && m.sendStatus !== "scheduled" && m.sendStatus !== "sending") return;

  await db.update(messages).set({ sendStatus: "sending", sendAttempts: m.sendAttempts + 1, updatedAt: new Date() }).where(eq(messages.id, m.id));
  await publishUserEvent(m.userId, { type: "send.status", messageId: m.id, threadId: m.threadId, status: "sending" });

  const [owner] = await db
    .select({ address: users.address, firstName: users.firstName, lastName: users.lastName, displayName: userSettings.displayName })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, m.userId))
    .limit(1);
  if (!owner) return;

  const recips = await db
    .select()
    .from(messageRecipients)
    .where(eq(messageRecipients.messageId, m.id))
    .orderBy(asc(messageRecipients.position));
  const atts = await db.select().from(attachments).where(and(eq(attachments.messageId, m.id), eq(attachments.userId, m.userId)));

  const pick = (k: string) => recips.filter((r) => r.kind === k).map((r) => ({ name: r.name, address: r.address }));
  const to = pick("to");
  const cc = pick("cc");
  const bcc = pick("bcc");
  const everyone = [...to, ...cc, ...bcc];
  if (everyone.length === 0) {
    await markFailed(m, "The message has no recipients.");
    return;
  }

  const html = `${m.htmlBody ?? ""}${m.draftContext?.quotedHtml ?? ""}`;
  const text = htmlToText(html);
  const fromName = owner.displayName?.trim() || `${owner.firstName} ${owner.lastName}`.trim();
  const raw = await buildMime({
    from: { name: fromName, address: owner.address },
    to,
    cc,
    bcc,
    subject: m.subject,
    text,
    html,
    messageId: m.messageIdHeader!,
    inReplyTo: m.inReplyTo,
    references: m.referencesHeader,
    date: m.scheduledAt ?? m.date,
    attachments: await Promise.all(
      atts.map(async (a) => ({ filename: a.filename, contentType: a.contentType, content: await storage().get(a.storageKey), contentId: a.contentId, inline: a.isInline })),
    ),
  });

  const rawKey = m.rawKey ?? `${userPrefix(m.userId)}raw/${m.id}.eml`;
  await storage().put(rawKey, raw, "message/rfc822");

  const local = everyone.filter((r) => isLocalDomain(domainOf(r.address)) && env().LOCAL_DELIVERY);
  const external = everyone.filter((r) => !local.includes(r));
  const failures: string[] = [];

  if (local.length > 0) {
    try {
      const outcome = await ingestRawMessage(raw, {
        source: "local",
        envelope: { mailFrom: owner.address, rcptTo: [...new Set(local.map((r) => r.address))] },
      });
      for (const r of outcome.rejected) failures.push(`${r.address}: ${r.reason}`);
    } catch (err) {
      if (err instanceof IngestError && err.code === "no_recipients") {
        for (const r of local) failures.push(`${r.address}: No such mailbox`);
      } else {
        throw err;
      }
    }
  }

  if (external.length > 0) {
    const transport = getOutboundTransport();
    if (!transport) {
      for (const r of external) failures.push(`${r.address}: no outbound email provider is configured`);
    } else {
      try {
        const result = await transport.send({ envelope: { from: owner.address, to: [...new Set(external.map((r) => r.address))] }, raw });
        for (const r of result.rejected) failures.push(`${r}: rejected by the provider`);
      } catch (err) {
        if (err instanceof TransportError && !err.permanent && attempt < maxAttempts) {
          await db
            .update(messages)
            .set({ sendStatus: "queued", sendError: `Temporary delivery problem, retrying: ${err.message}`.slice(0, 1000), rawKey, sizeBytes: raw.length })
            .where(eq(messages.id, m.id));
          await publishUserEvent(m.userId, { type: "send.status", messageId: m.id, threadId: m.threadId, status: "queued", error: err.message });
          throw err;
        }
        const msg = (err as Error).message;
        logger.warn({ messageId: m.id, err: msg }, "outbound delivery failed permanently");
        for (const r of external) failures.push(`${r.address}: ${msg}`);
      }
    }
  }

  const allFailed = failures.length >= new Set(everyone.map((r) => r.address)).size;
  const now = new Date();
  const ctx = m.draftContext ? { ...m.draftContext, quotedHtml: undefined } : null;
  await db
    .update(messages)
    .set({
      sendStatus: allFailed ? "failed" : "sent",
      sendError: failures.length ? failures.join("; ").slice(0, 1000) : null,
      sentAt: allFailed ? null : now,
      htmlBody: html,
      textBody: text,
      snippet: makeSnippet(text),
      hasAttachments: atts.some((a) => !a.isInline),
      rawKey,
      sizeBytes: raw.length,
      draftContext: ctx,
      updatedAt: now,
    })
    .where(eq(messages.id, m.id));

  if (failures.length > 0) {
    await createNotification(m.userId, {
      type: allFailed ? "send_failed" : "bounce",
      title: allFailed ? "Message not sent" : "Some recipients did not receive your message",
      body: `"${m.subject || "(no subject)"}": ${failures.join("; ")}`.slice(0, 500),
      threadId: m.threadId,
      messageId: m.id,
    });
  }
  if (!allFailed) await recordOutgoingContacts(m.userId, everyone);
  await publishUserEvent(m.userId, {
    type: "send.status",
    messageId: m.id,
    threadId: m.threadId,
    status: allFailed ? "failed" : "sent",
    error: failures.length ? failures.join("; ") : null,
  });
  logger.info({ messageId: m.id, local: local.length, external: external.length, failures: failures.length }, "message sent");
}

/** Called when a send job exhausted its retries. */
export async function finalizeFailedSend(payload: { messageId?: string }, error: string) {
  if (!payload.messageId) return;
  const [m] = await db.select().from(messages).where(eq(messages.id, payload.messageId)).limit(1);
  if (!m || m.sendStatus === "sent") return;
  await markFailed(m, error);
}
