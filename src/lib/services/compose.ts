import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "../db";
import { attachments, messageRecipients, messages, threads, userSettings, users, type DraftContext, type Message } from "../db/schema";
import { env, isLocalDomain, outboundConfigured } from "../env";
import { AppError, badRequest, forbidden, notFound } from "../errors";
import { enqueueJob, cancelPendingJob } from "../jobs";
import { hitRateLimit } from "../rate-limit";
import { publishUserEvent } from "../events";
import { domainOf, isValidEmail, normalizeAddress, type EmailAddress } from "../mail/address";
import { newMessageId } from "../mail/compose";
import { escapeHtml, htmlToText, makeSnippet, sanitizeEmailHtml, textToHtml } from "../mail/sanitize";
import { forwardSubject, normalizeSubject, replySubject } from "../mail/subject";
import { storage, userPrefix } from "../storage";
import { getOwnedMessage, hydrateMessages } from "./mailbox";

const addressSchema = z.object({
  name: z.string().trim().max(200).default(""),
  address: z.string().trim().toLowerCase().max(320),
});

export const draftPatchSchema = z.object({
  to: z.array(addressSchema).max(100).optional(),
  cc: z.array(addressSchema).max(100).optional(),
  bcc: z.array(addressSchema).max(100).optional(),
  subject: z.string().max(998).optional(),
  html: z.string().max(2_000_000).optional(),
});

export const draftCreateSchema = draftPatchSchema.extend({
  mode: z.enum(["new", "reply", "reply_all", "forward"]).default("new"),
  sourceMessageId: z.string().uuid().optional(),
});

async function loadUser(userId: string) {
  const [row] = await db
    .select({ user: users, settings: userSettings })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw notFound("Account not found.");
  return row;
}

function senderName(row: Awaited<ReturnType<typeof loadUser>>) {
  return row.settings?.displayName?.trim() || `${row.user.firstName} ${row.user.lastName}`.trim();
}

function signatureBlock(signatureHtml: string | undefined | null) {
  if (!signatureHtml || !signatureHtml.trim()) return "";
  return `<p></p><p>-- </p>${signatureHtml}`;
}

function formatQuoteDate(d: Date, locale: string, timeZone: string) {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(d);
  } catch {
    return d.toUTCString();
  }
}

async function replaceRecipients(
  messageId: string,
  userId: string,
  data: { to?: EmailAddress[]; cc?: EmailAddress[]; bcc?: EmailAddress[] },
  tx: DbOrTx = db,
) {
  const kinds = (["to", "cc", "bcc"] as const).filter((k) => data[k] !== undefined);
  if (kinds.length === 0) return;
  await tx.delete(messageRecipients).where(and(eq(messageRecipients.messageId, messageId), inArray(messageRecipients.kind, kinds)));
  const rows = kinds.flatMap((kind) =>
    (data[kind] ?? []).map((a, i) => ({ messageId, userId, kind, name: a.name, address: normalizeAddress(a.address), position: i })),
  );
  if (rows.length) await tx.insert(messageRecipients).values(rows);
}

/**
 * Creates a draft. Replies and forwards are pre-filled from the source message:
 * recipients, subject, signature and the quoted original.
 */
export async function createDraft(userId: string, input: z.infer<typeof draftCreateSchema>) {
  const me = await loadUser(userId);
  const locale = me.settings?.locale ?? "en-US";
  const timeZone = me.settings?.timeZone ?? "UTC";
  const ctx: DraftContext = { mode: input.mode };
  let threadId: string | null = null;
  let to: EmailAddress[] = input.to ?? [];
  let cc: EmailAddress[] = input.cc ?? [];
  let subject = input.subject ?? "";
  let source: Message | null = null;

  if (input.mode !== "new") {
    if (!input.sourceMessageId) throw badRequest("A source message is required.");
    source = await getOwnedMessage(userId, input.sourceMessageId);
    ctx.sourceMessageId = source.id;
    threadId = source.threadId;
    const [srcDto] = await hydrateMessages(userId, [source]);
    const self = me.user.address;
    const notSelf = (a: EmailAddress) => normalizeAddress(a.address) !== self;
    const dedupe = (list: EmailAddress[]) => {
      const seen = new Set<string>();
      return list.filter((a) => (seen.has(a.address) ? false : (seen.add(a.address), true)));
    };

    if (input.mode === "reply" || input.mode === "reply_all") {
      const primary: EmailAddress[] =
        source.direction === "outbound"
          ? srcDto.to
          : source.replyTo
            ? source.replyTo.split(",").map((a) => ({ name: "", address: a.trim() })).filter((a) => a.address)
            : [{ name: source.fromName, address: source.fromAddress }];
      to = input.to ?? primary;
      if (input.mode === "reply_all" && !input.to) {
        to = dedupe([...primary, ...srcDto.to.filter(notSelf)]);
        cc = dedupe(srcDto.cc.filter(notSelf).filter((c) => !to.some((t) => t.address === c.address)));
      }
      subject = input.subject ?? replySubject(source.subject);
      const original = source.htmlBody ?? textToHtml(source.textBody);
      ctx.quotedHtml = sanitizeEmailHtml(
        `<div class="mailed-quote"><p>On ${escapeHtml(formatQuoteDate(source.date, locale, timeZone))}, ${escapeHtml(
          source.fromName || source.fromAddress,
        )} &lt;${escapeHtml(source.fromAddress)}&gt; wrote:</p><blockquote type="cite" style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${original}</blockquote></div>`,
      );
    } else {
      subject = input.subject ?? forwardSubject(source.subject);
      const original = source.htmlBody ?? textToHtml(source.textBody);
      const list = (l: EmailAddress[]) => l.map((a) => escapeHtml(a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");
      ctx.quotedHtml = sanitizeEmailHtml(
        `<div class="mailed-forward"><p>---------- Forwarded message ---------<br>From: ${escapeHtml(source.fromName ? `${source.fromName} <${source.fromAddress}>` : source.fromAddress)}<br>Date: ${escapeHtml(
          formatQuoteDate(source.date, locale, timeZone),
        )}<br>Subject: ${escapeHtml(source.subject)}<br>To: ${list(srcDto.to)}${srcDto.cc.length ? `<br>Cc: ${list(srcDto.cc)}` : ""}</p>${original}</div>`,
      );
    }
  }

  const bodyHtml = input.html !== undefined ? sanitizeEmailHtml(input.html) : `<p></p>${signatureBlock(me.settings?.signatureHtml)}`;
  const text = htmlToText(bodyHtml);
  const now = new Date();

  const draft = await db.transaction(async (tx) => {
    if (!threadId) {
      const [t] = await tx.insert(threads).values({ userId, subject: normalizeSubject(subject), lastMessageAt: now }).returning({ id: threads.id });
      threadId = t.id;
    }
    const [m] = await tx
      .insert(messages)
      .values({
        userId,
        threadId,
        direction: "outbound",
        folder: "drafts",
        sendStatus: "draft",
        fromName: senderName(me),
        fromAddress: me.user.address,
        subject,
        snippet: makeSnippet(text),
        textBody: text,
        htmlBody: bodyHtml,
        isRead: true,
        date: now,
        sortDate: now,
        draftContext: ctx,
      })
      .returning();
    await replaceRecipients(m.id, userId, { to, cc, bcc: input.bcc ?? [] }, tx);
    return m;
  });

  // Forwarded attachments are copied so the draft owns independent files.
  if (source && input.mode === "forward" && source.hasAttachments) {
    const srcAtts = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.userId, userId), eq(attachments.messageId, source.id), eq(attachments.isInline, false)));
    for (const a of srcAtts) {
      if (a.isDangerous) continue;
      const id = crypto.randomUUID();
      const key = `${userPrefix(userId)}att/${id}`;
      await storage().copy(a.storageKey, key);
      await db.insert(attachments).values({ ...a, id, messageId: draft.id, storageKey: key, createdAt: new Date() });
    }
    if (srcAtts.length) await db.update(messages).set({ hasAttachments: true }).where(eq(messages.id, draft.id));
  }

  const [dto] = await hydrateMessages(userId, [(await getOwnedMessage(userId, draft.id))]);
  return { ...dto, quotedHtml: ctx.quotedHtml ?? null };
}

async function getEditableDraft(userId: string, draftId: string) {
  const m = await getOwnedMessage(userId, draftId);
  if (m.folder !== "drafts" || m.sendStatus !== "draft") throw new AppError(409, "not_editable", "This message has already been sent or is no longer a draft.");
  return m;
}

export async function getDraft(userId: string, draftId: string) {
  const draft = await getEditableDraft(userId, draftId);
  const [dto] = await hydrateMessages(userId, [draft]);
  return { ...dto, quotedHtml: draft.draftContext?.quotedHtml ?? null };
}

export async function updateDraft(userId: string, draftId: string, patch: z.infer<typeof draftPatchSchema>) {
  const draft = await getEditableDraft(userId, draftId);
  const now = new Date();
  const set: Partial<typeof messages.$inferInsert> = { updatedAt: now, date: now, sortDate: now };
  if (patch.subject !== undefined) set.subject = patch.subject.replace(/[\r\n]+/g, " ");
  if (patch.html !== undefined) {
    const html = sanitizeEmailHtml(patch.html);
    const text = htmlToText(html);
    set.htmlBody = html;
    set.textBody = text;
    set.snippet = makeSnippet(text);
  }
  await db.update(messages).set(set).where(and(eq(messages.id, draft.id), eq(messages.userId, userId)));
  await replaceRecipients(draft.id, userId, patch);
  if (patch.subject !== undefined) {
    // Keep the thread title in sync for drafts that started a new conversation.
    await db.execute(sql`
      update threads set subject = ${normalizeSubject(set.subject ?? "")}
      where id = ${draft.threadId} and user_id = ${userId}
        and not exists (select 1 from messages m where m.thread_id = ${draft.threadId} and m.id <> ${draft.id})
    `);
  }
  return { id: draft.id, savedAt: now.toISOString() };
}

export async function discardDraft(userId: string, draftId: string) {
  const draft = await getEditableDraft(userId, draftId);
  const { purgeMessages } = await import("./actions");
  await purgeMessages(userId, [draft.id]);
  await publishUserEvent(userId, { type: "mail.changed", threadIds: [draft.threadId] });
}

export const sendSchema = z.object({ scheduledAt: z.string().datetime().optional() });

export async function sendDraft(userId: string, draftId: string, opts: z.infer<typeof sendSchema>) {
  const draft = await getEditableDraft(userId, draftId);
  const me = await loadUser(userId);
  const [dto] = await hydrateMessages(userId, [draft]);
  const all = [...dto.to, ...dto.cc, ...dto.bcc];

  if (all.length === 0) throw badRequest("Add at least one recipient.", { field: "to" });
  if (all.length > 100) throw badRequest("Send to at most 100 recipients at once.");
  const invalid = all.filter((a) => !isValidEmail(a.address));
  if (invalid.length) throw badRequest(`Check these addresses: ${invalid.map((a) => a.address).join(", ")}`, { field: "to", invalid: invalid.map((a) => a.address) });

  const external = all.filter((a) => !isLocalDomain(domainOf(a.address)));
  if (external.length > 0 && !me.user.emailVerifiedAt) {
    throw forbidden("Confirm your recovery email before sending to addresses outside Mailed.");
  }
  if (external.length > 0 && !outboundConfigured()) {
    throw new AppError(
      503,
      "provider_not_configured",
      `Mail to external addresses (${external.slice(0, 3).map((a) => a.address).join(", ")}) cannot be sent because no outbound email provider is configured on this server.`,
    );
  }

  const [{ size }] = await db
    .select({ size: sql<number>`coalesce(sum(${attachments.sizeBytes}), 0)::int` })
    .from(attachments)
    .where(and(eq(attachments.userId, userId), eq(attachments.messageId, draft.id)));
  if (size > env().MAX_MESSAGE_SIZE_MB * 1024 * 1024) throw badRequest(`Attachments exceed ${env().MAX_MESSAGE_SIZE_MB} MB.`);

  let scheduledAt: Date | null = null;
  if (opts.scheduledAt) {
    scheduledAt = new Date(opts.scheduledAt);
    if (scheduledAt.getTime() < Date.now() + 60_000) throw badRequest("Schedule the message at least a minute from now.");
    if (scheduledAt.getTime() > Date.now() + 366 * 86400_000) throw badRequest("Schedule the message within a year.");
  }

  const hourly = await hitRateLimit(`send:h:${userId}`, env().SEND_LIMIT_PER_HOUR, 3600);
  const daily = await hitRateLimit(`send:d:${userId}`, env().SEND_LIMIT_PER_DAY, 86400);
  if (!hourly.allowed || !daily.allowed) {
    throw new AppError(429, "rate_limited", "You have reached the sending limit. Try again later.", {
      retryAfter: Math.max(hourly.allowed ? 0 : hourly.retryAfter, daily.allowed ? 0 : daily.retryAfter),
    });
  }

  let inReplyTo: string | null = null;
  let references: string[] = [];
  if (draft.draftContext?.sourceMessageId && draft.draftContext.mode !== "new") {
    const [src] = await db
      .select({ messageIdHeader: messages.messageIdHeader, referencesHeader: messages.referencesHeader })
      .from(messages)
      .where(and(eq(messages.id, draft.draftContext.sourceMessageId), eq(messages.userId, userId)))
      .limit(1);
    if (src?.messageIdHeader) {
      inReplyTo = src.messageIdHeader;
      references = [...src.referencesHeader, src.messageIdHeader].slice(-20);
    }
  }

  const messageId = newMessageId(domainOf(me.user.address));
  const undoSeconds = Math.min(Math.max(me.settings?.undoSendSeconds ?? 5, 0), 30);
  const runAt = scheduledAt ?? new Date(Date.now() + undoSeconds * 1000);
  const when = scheduledAt ?? new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(messages)
      .set({
        folder: "sent",
        sendStatus: scheduledAt ? "scheduled" : "queued",
        scheduledAt,
        sendError: null,
        messageIdHeader: messageId,
        inReplyTo,
        referencesHeader: references,
        dedupeKey: `out:${messageId}`,
        fromName: senderName(me),
        date: when,
        sortDate: when,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, draft.id));
    await tx
      .update(threads)
      .set({ lastMessageAt: sql`greatest(${threads.lastMessageAt}, ${when.toISOString()}::timestamptz)` })
      .where(eq(threads.id, draft.threadId));
    await enqueueJob("send_message", { messageId: draft.id }, { runAt, uniqueKey: `send:${draft.id}`, maxAttempts: 7 }, tx);
  });

  await publishUserEvent(userId, { type: "mail.changed", threadIds: [draft.threadId] });
  return {
    id: draft.id,
    threadId: draft.threadId,
    status: scheduledAt ? "scheduled" : "queued",
    sendAt: runAt.toISOString(),
    undoable: !scheduledAt && undoSeconds > 0,
  };
}

/** Undo send / cancel a scheduled message: the message goes back to Drafts. */
export async function cancelSend(userId: string, messageId: string) {
  const m = await getOwnedMessage(userId, messageId);
  if (m.sendStatus !== "queued" && m.sendStatus !== "scheduled") {
    throw new AppError(409, "too_late", "This message is already on its way and can no longer be cancelled.");
  }
  const cancelled = await cancelPendingJob(`send:${m.id}`);
  if (!cancelled) throw new AppError(409, "too_late", "This message is already on its way and can no longer be cancelled.");
  await db
    .update(messages)
    .set({ folder: "drafts", sendStatus: "draft", scheduledAt: null, messageIdHeader: null, dedupeKey: null, sendError: null, updatedAt: new Date() })
    .where(eq(messages.id, m.id));
  await publishUserEvent(userId, { type: "mail.changed", threadIds: [m.threadId] });
  return { id: m.id, threadId: m.threadId };
}

export async function retrySend(userId: string, messageId: string) {
  const m = await getOwnedMessage(userId, messageId);
  if (m.sendStatus !== "failed") throw new AppError(409, "not_failed", "Only failed messages can be retried.");
  await db.update(messages).set({ sendStatus: "queued", sendError: null, updatedAt: new Date() }).where(eq(messages.id, m.id));
  await enqueueJob("send_message", { messageId: m.id }, { uniqueKey: `send:${m.id}`, maxAttempts: 7 });
  await publishUserEvent(userId, { type: "mail.changed", threadIds: [m.threadId] });
  return { id: m.id };
}
