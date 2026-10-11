import { and, asc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  attachments,
  labels,
  messageLabels,
  messageRecipients,
  messages,
  reminders,
  threads,
  type Message,
} from "../db/schema";
import { notFound } from "../errors";
import { signToken } from "../crypto";
import { env } from "../env";
import { parseSearch } from "../search/parse";
import { searchPredicate } from "../search/sql";
import type {
  AttachmentDTO,
  CategoryName,
  FolderName,
  LabelDTO,
  MailboxCounts,
  MessageDTO,
  SystemView,
  ThreadDetail,
  ThreadListResponse,
  ThreadSummary,
  ViewRef,
} from "../types";

type ViewOptions = { inboxCategories: boolean };

/** SQL predicate over alias `m` selecting the messages that make a thread appear in a view. */
export function viewPredicate(view: ViewRef, userId: string, opts: ViewOptions): SQL {
  if (view.kind === "label") {
    return sql`m.folder not in ('spam', 'trash') and exists (select 1 from message_labels ml where ml.message_id = m.id and ml.label_id = ${view.labelId} and ml.user_id = ${userId})`;
  }
  if (view.kind === "search") {
    return searchPredicate(parseSearch(view.query), userId);
  }
  const v: SystemView = view.view;
  switch (v) {
    case "inbox":
      return opts.inboxCategories
        ? sql`m.folder = 'inbox' and m.snoozed_until is null and m.category = 'primary'`
        : sql`m.folder = 'inbox' and m.snoozed_until is null`;
    case "social":
    case "promotions":
    case "updates":
    case "forums":
    case "ads":
      return sql`m.folder = 'inbox' and m.snoozed_until is null and m.category = ${v}`;
    case "starred":
      return sql`m.is_starred and m.folder not in ('spam', 'trash')`;
    case "important":
      return sql`m.is_important and m.folder not in ('spam', 'trash')`;
    case "snoozed":
      return sql`m.snoozed_until is not null and m.folder not in ('spam', 'trash')`;
    case "sent":
      return sql`m.folder = 'sent' and m.send_status is distinct from 'scheduled'`;
    case "scheduled":
      return sql`m.folder = 'sent' and m.send_status = 'scheduled'`;
    case "drafts":
      return sql`m.folder = 'drafts'`;
    case "archive":
      return sql`m.folder = 'archive'`;
    case "spam":
      return sql`m.folder = 'spam'`;
    case "trash":
      return sql`m.folder = 'trash'`;
    case "all":
      return sql`m.folder not in ('spam', 'trash', 'drafts')`;
  }
}

/** Which messages of a thread are shown when it is opened from a view. */
function threadVisibility(view: ViewRef): SQL {
  if (view.kind === "system" && view.view === "trash") return sql`m.folder = 'trash'`;
  if (view.kind === "system" && view.view === "spam") return sql`m.folder = 'spam'`;
  return sql`m.folder not in ('trash', 'spam')`;
}

type Cursor = { d: string; t: string };

function encodeCursor(c: Cursor) {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(value: string | null | undefined): Cursor | null {
  if (!value) return null;
  try {
    const c = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (typeof c.d !== "string" || typeof c.t !== "string" || !/^[0-9a-f-]{36}$/i.test(c.t) || Number.isNaN(Date.parse(c.d))) return null;
    return c;
  } catch {
    return null;
  }
}

type ListRow = {
  thread_id: string;
  last_at: Date | string;
  matched: number;
  unread: boolean;
  starred: boolean;
  important: boolean;
  attachments: boolean;
  suspicious: boolean;
  id: string;
  subject: string;
  snippet: string;
  category: CategoryName;
  folder: FolderName;
  spam_score: number;
  snoozed_until: Date | string | null;
  send_status: string | null;
  scheduled_at: Date | string | null;
  date: Date | string;
};

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

export async function listThreads(
  userId: string,
  view: ViewRef,
  opts: ViewOptions & { cursor?: string | null; limit?: number; filter?: string | null },
): Promise<ThreadListResponse> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 10), 100);
  const base = viewPredicate(view, userId, opts);
  // Optional filters narrow the current view without changing its folder.
  const predicate = opts.filter?.trim()
    ? sql`(${base}) and (${searchPredicate(parseSearch(opts.filter), userId, { restrictFolder: false })})`
    : base;
  const cursor = decodeCursor(opts.cursor);
  const cursorCond = cursor ? sql`where (a.last_at, a.thread_id) < (${cursor.d}::timestamptz, ${cursor.t}::uuid)` : sql``;

  const rows = await db.execute<ListRow>(sql`
    with matched as (
      select m.* from messages m where m.user_id = ${userId} and (${predicate})
    ),
    agg as (
      select thread_id,
        max(sort_date) as last_at,
        count(*)::int as matched,
        bool_or(not is_read) as unread,
        bool_or(is_starred) as starred,
        bool_or(is_important) as important,
        bool_or(has_attachments) as attachments,
        bool_or(is_suspicious) as suspicious
      from matched group by thread_id
    ),
    latest as (
      select distinct on (thread_id) thread_id, id, subject, snippet, category, folder, spam_score,
        snoozed_until, send_status, scheduled_at, date
      from matched order by thread_id, sort_date desc, id desc
    )
    select a.*, l.id, l.subject, l.snippet, l.category, l.folder, l.spam_score, l.snoozed_until,
      l.send_status, l.scheduled_at, l.date
    from agg a join latest l using (thread_id)
    ${cursorCond}
    order by a.last_at desc, a.thread_id desc
    limit ${limit + 1}
  `);

  const page = rows.slice(0, limit);
  const nextCursor =
    rows.length > limit ? encodeCursor({ d: new Date(page[page.length - 1].last_at).toISOString(), t: page[page.length - 1].thread_id }) : null;

  const [{ total }] = await db.execute<{ total: number }>(
    sql`select count(distinct m.thread_id)::int as total from messages m where m.user_id = ${userId} and (${predicate})`,
  );

  if (page.length === 0) return { threads: [], nextCursor: null, total };

  const threadIds = page.map((r) => r.thread_id);
  const visibility = threadVisibility(view);
  const [members, recipientRows, labelRows] = await Promise.all([
    db.execute<{ thread_id: string; direction: string; from_name: string; from_address: string; is_read: boolean; folder: string }>(sql`
      select m.thread_id, m.direction, m.from_name, m.from_address, m.is_read, m.folder
      from messages m
      where m.user_id = ${userId} and m.thread_id in ${threadIds} and ${visibility}
      order by m.date asc
    `),
    db
      .select({ messageId: messageRecipients.messageId, name: messageRecipients.name, address: messageRecipients.address, kind: messageRecipients.kind })
      .from(messageRecipients)
      .where(and(eq(messageRecipients.userId, userId), inArray(messageRecipients.messageId, page.map((r) => r.id))))
      .orderBy(asc(messageRecipients.kind), asc(messageRecipients.position)),
    db.execute<{ thread_id: string; id: string; name: string; color: string }>(sql`
      select distinct m.thread_id, lb.id, lb.name, lb.color
      from message_labels ml
      join messages m on m.id = ml.message_id
      join labels lb on lb.id = ml.label_id
      where ml.user_id = ${userId} and m.thread_id in ${threadIds} and m.folder not in ('trash')
    `),
  ]);

  const threadsOut: ThreadSummary[] = page.map((r) => {
    const own = members.filter((m) => m.thread_id === r.thread_id);
    const participants: ThreadSummary["participants"] = [];
    for (const m of own) {
      const isMe = m.direction === "outbound";
      const key = isMe ? "__me" : m.from_address;
      const existing = participants.find((p) => (p.isMe ? "__me" : p.address) === key);
      if (existing) {
        existing.unread ||= !m.is_read;
        continue;
      }
      participants.push({ name: isMe ? "me" : m.from_name, address: m.from_address, isMe, unread: !m.is_read });
    }
    return {
      id: r.thread_id,
      subject: r.subject,
      snippet: r.snippet,
      date: iso(r.date)!,
      participants: participants.slice(-4),
      recipients: recipientRows.filter((x) => x.messageId === r.id && x.kind !== "bcc").map((x) => ({ name: x.name, address: x.address })),
      messageCount: own.filter((m) => m.folder !== "drafts").length || own.length,
      unread: r.unread,
      starred: r.starred,
      important: r.important,
      hasAttachments: r.attachments,
      hasDraft: own.some((m) => m.folder === "drafts"),
      category: r.category,
      folder: r.folder,
      suspicious: r.suspicious,
      spamScore: Number(r.spam_score),
      snoozedUntil: iso(r.snoozed_until),
      sendStatus: r.send_status,
      scheduledAt: iso(r.scheduled_at),
      labels: labelRows.filter((l) => l.thread_id === r.thread_id).map((l) => ({ id: l.id, name: l.name, color: l.color })),
      latestMessageId: r.id,
    };
  });

  return { threads: threadsOut, nextCursor, total };
}

export async function mailboxCounts(userId: string, opts: ViewOptions): Promise<MailboxCounts> {
  const inboxCat = opts.inboxCategories ? sql`and category = 'primary'` : sql``;
  const [row] = await db.execute<Record<string, number>>(sql`
    select
      count(distinct thread_id) filter (where folder = 'inbox' and snoozed_until is null and not is_read ${inboxCat})::int as inbox,
      count(distinct thread_id) filter (where folder = 'inbox' and snoozed_until is null and not is_read and category = 'social')::int as social,
      count(distinct thread_id) filter (where folder = 'inbox' and snoozed_until is null and not is_read and category = 'promotions')::int as promotions,
      count(distinct thread_id) filter (where folder = 'inbox' and snoozed_until is null and not is_read and category = 'updates')::int as updates,
      count(distinct thread_id) filter (where folder = 'inbox' and snoozed_until is null and not is_read and category = 'forums')::int as forums,
      count(distinct thread_id) filter (where folder = 'inbox' and snoozed_until is null and not is_read and category = 'ads')::int as ads,
      count(distinct thread_id) filter (where folder = 'spam' and not is_read)::int as spam,
      count(*) filter (where folder = 'drafts')::int as drafts,
      count(*) filter (where folder = 'sent' and send_status = 'scheduled')::int as scheduled,
      count(distinct thread_id) filter (where snoozed_until is not null and folder not in ('spam', 'trash'))::int as snoozed,
      count(*) filter (where folder = 'sent' and send_status in ('failed', 'bounced'))::int as failed,
      count(distinct thread_id) filter (where folder = 'trash')::int as trash
    from messages
    where user_id = ${userId}
  `);
  const labelRows = await db.execute<{ label_id: string; unread: number; total: number }>(sql`
    select ml.label_id,
      count(distinct m.thread_id) filter (where not m.is_read)::int as unread,
      count(distinct m.thread_id)::int as total
    from message_labels ml join messages m on m.id = ml.message_id
    where ml.user_id = ${userId} and m.folder not in ('spam', 'trash')
    group by ml.label_id
  `);
  return {
    unread: {
      inbox: row.inbox,
      social: row.social,
      promotions: row.promotions,
      updates: row.updates,
      forums: row.forums,
      ads: row.ads,
      spam: row.spam,
    },
    totals: { drafts: row.drafts, scheduled: row.scheduled, snoozed: row.snoozed, sent: row.failed, trash: row.trash },
    labels: Object.fromEntries(labelRows.map((l) => [l.label_id, { unread: l.unread, total: l.total }])),
  };
}

/** Short-lived URL for an inline image (cid:) that works inside the sandboxed frame. */
function inlineUrl(storageKey: string, contentType: string, filename: string) {
  const payload = JSON.stringify({ k: storageKey, f: filename, t: contentType, d: "inline" });
  return `/api/files/${signToken(env().APP_SECRET, payload, 3600)}`;
}

function rewriteCid(html: string, inline: { contentId: string | null; storageKey: string; contentType: string; filename: string }[]) {
  if (!html.includes("cid:")) return html;
  return html.replace(/(["'(])cid:([^"')\s]+)/gi, (match, prefix: string, cid: string) => {
    const att = inline.find((a) => a.contentId && a.contentId.toLowerCase() === decodeURIComponent(cid).toLowerCase());
    return att && att.contentType.startsWith("image/") ? `${prefix}${inlineUrl(att.storageKey, att.contentType, att.filename)}` : `${prefix}about:blank`;
  });
}

export function toMessageDTO(
  m: Message,
  extra: {
    recipients: { kind: string; name: string; address: string }[];
    attachments: (AttachmentDTO & { storageKey: string; contentId: string | null })[];
    labels: LabelDTO[];
    reminder: MessageDTO["reminder"];
  },
): MessageDTO {
  const cls = m.classification;
  const html = m.htmlBody ? rewriteCid(m.htmlBody, extra.attachments.filter((a) => a.contentId)) : null;
  const pick = (kind: string) => extra.recipients.filter((r) => r.kind === kind).map((r) => ({ name: r.name, address: r.address }));
  return {
    id: m.id,
    threadId: m.threadId,
    direction: m.direction,
    accountId: m.linkedAccountId,
    folder: m.folder,
    category: m.category,
    from: { name: m.fromName, address: m.fromAddress },
    replyTo: m.replyTo,
    to: pick("to"),
    cc: pick("cc"),
    bcc: m.direction === "outbound" ? pick("bcc") : [],
    subject: m.subject,
    snippet: m.snippet,
    text: m.textBody,
    html,
    hasRemoteContent: m.hasRemoteContent,
    date: m.date.toISOString(),
    isRead: m.isRead,
    isStarred: m.isStarred,
    isImportant: m.isImportant,
    isSuspicious: m.isSuspicious,
    snoozedUntil: iso(m.snoozedUntil),
    sendStatus: m.sendStatus,
    sendError: m.sendError,
    scheduledAt: iso(m.scheduledAt),
    sentAt: iso(m.sentAt),
    attachments: extra.attachments
      .filter((a) => !a.isInline || !m.htmlBody?.includes(`cid:${a.contentId ?? "\u0000"}`))
      .map((a) => ({ id: a.id, filename: a.filename, contentType: a.contentType, size: a.size, isInline: a.isInline, isDangerous: a.isDangerous })),
    labels: extra.labels,
    security: m.security
      ? {
          phishing: m.security.phishing,
          phishingReasons: m.security.phishingReasons,
          unknownSender: m.security.unknownSender,
          spoofedDisplayName: m.security.spoofedDisplayName,
          replyToMismatch: m.security.replyToMismatch,
          suspiciousLinks: m.security.suspiciousLinks,
          dangerousAttachments: m.security.dangerousAttachments,
          auth: m.security.auth,
        }
      : null,
    classification: cls
      ? {
          spamProbability: cls.spam.probability,
          spamReasons: cls.spam.reasons,
          spamSource: cls.spam.source,
          category: cls.category.value,
          categoryScores: cls.category.scores,
          categoryReasons: cls.category.reasons,
          categorySource: cls.category.source,
        }
      : null,
    listUnsubscribe: m.listUnsubscribe,
    messageIdHeader: m.messageIdHeader,
    isDraft: m.folder === "drafts" && m.sendStatus === "draft",
    draftContext: m.draftContext ?? null,
    reminder: extra.reminder,
  };
}

/** Loads recipients, attachments, labels and reminders for a set of the user's messages. */
export async function hydrateMessages(userId: string, rows: Message[]): Promise<MessageDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((m) => m.id);
  const [recips, atts, lbls, rems] = await Promise.all([
    db
      .select()
      .from(messageRecipients)
      .where(and(eq(messageRecipients.userId, userId), inArray(messageRecipients.messageId, ids)))
      .orderBy(asc(messageRecipients.position)),
    db
      .select()
      .from(attachments)
      .where(and(eq(attachments.userId, userId), inArray(attachments.messageId, ids)))
      .orderBy(asc(attachments.createdAt)),
    db
      .select({ messageId: messageLabels.messageId, id: labels.id, name: labels.name, color: labels.color })
      .from(messageLabels)
      .innerJoin(labels, eq(labels.id, messageLabels.labelId))
      .where(and(eq(messageLabels.userId, userId), inArray(messageLabels.messageId, ids))),
    db
      .select()
      .from(reminders)
      .where(and(eq(reminders.userId, userId), inArray(reminders.messageId, ids), isNull(reminders.firedAt))),
  ]);
  return rows.map((m) => {
    const rem = rems.find((r) => r.messageId === m.id);
    return toMessageDTO(m, {
      recipients: recips.filter((r) => r.messageId === m.id),
      attachments: atts
        .filter((a) => a.messageId === m.id)
        .map((a) => ({
          id: a.id,
          filename: a.filename,
          contentType: a.contentType,
          size: a.sizeBytes,
          isInline: a.isInline,
          isDangerous: a.isDangerous,
          storageKey: a.storageKey,
          contentId: a.contentId,
        })),
      labels: lbls.filter((l) => l.messageId === m.id).map((l) => ({ id: l.id, name: l.name, color: l.color })),
      reminder: rem ? { id: rem.id, remindAt: rem.remindAt.toISOString(), onlyIfNoReply: rem.onlyIfNoReply } : null,
    });
  });
}

export async function getThread(userId: string, threadId: string, view: ViewRef): Promise<ThreadDetail> {
  if (!/^[0-9a-f-]{36}$/i.test(threadId)) throw notFound("Conversation not found.");
  const [thread] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, threadId), eq(threads.userId, userId)))
    .limit(1);
  if (!thread) throw notFound("Conversation not found.");

  const inTrashOrSpam = view.kind === "system" && (view.view === "trash" || view.view === "spam");
  const folderFilter = inTrashOrSpam
    ? eq(messages.folder, view.view as "trash" | "spam")
    : and(sql`${messages.folder} not in ('trash', 'spam')`);
  let rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.threadId, threadId), folderFilter))
    .orderBy(asc(messages.date));
  if (rows.length === 0) {
    // Opened from search or a stale link: show whatever exists.
    rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.userId, userId), eq(messages.threadId, threadId)))
      .orderBy(asc(messages.date));
  }
  if (rows.length === 0) throw notFound("Conversation not found.");

  const dto = await hydrateMessages(userId, rows);
  const labelMap = new Map<string, LabelDTO>();
  for (const m of dto) for (const l of m.labels) labelMap.set(l.id, l);
  return { id: thread.id, subject: thread.subject || rows[rows.length - 1].subject, messages: dto, labels: [...labelMap.values()] };
}

export async function getOwnedMessage(userId: string, messageId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) throw notFound("Message not found.");
  const [m] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.userId, userId)))
    .limit(1);
  if (!m) throw notFound("Message not found.");
  return m;
}

/** Messages addressed by thread ids and/or message ids, restricted to the owner. */
export function ownedScope(userId: string, target: { threadIds?: string[]; messageIds?: string[] }): SQL {
  const conds: SQL[] = [];
  if (target.threadIds?.length) conds.push(inArray(messages.threadId, target.threadIds));
  if (target.messageIds?.length) conds.push(inArray(messages.id, target.messageIds));
  if (conds.length === 0) return sql`false`;
  return and(eq(messages.userId, userId), conds.length === 1 ? conds[0] : or(...conds))!;
}
