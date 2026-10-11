import { isUniqueViolation } from "../errors";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { simpleParser, type ParsedMail, type AddressObject } from "mailparser";
import { db, type Tx } from "../db";
import {
  attachments as attachmentsTable,
  domainReputation,
  emailRules,
  labels,
  messageLabels,
  messageRecipients,
  messages,
  threads,
  userSettings,
  users,
  type Category,
  type Folder,
  type RuleAction,
} from "../db/schema";
import { env, isLocalDomain } from "../env";
import { logger } from "../logger";
import { sha256Hex } from "../crypto";
import { storage, userPrefix } from "../storage";
import { publishUserEvent } from "../events";
import { createNotification } from "../services/notifications";
import { getDomainReputation, senderCategoryOverride, senderListStatus, senderRelationship } from "../services/senders";
import { bayesLogOdds } from "../classify/bayes";
import { bayesTokensFor, extractFeatures, scoreMessage, type ClassifierMessage } from "../classify";
import { dnsblDomainHits, rspamdCheck, type ExternalVerdict } from "../classify/external";
import { isDangerousFilename } from "../classify/signals";
import {
  cleanMessageId,
  domainOf,
  localPartOf,
  normalizeAddress,
  parseReferences,
  registrableDomain,
  type EmailAddress,
} from "./address";
import { headerMap, parseAuthenticationResults, parseDeliveryReport, type AuthResults } from "./headers";
import { evaluateRules } from "./rules";
import { htmlToText, makeSnippet, referencesRemoteContent, sanitizeEmailHtml } from "./sanitize";
import { normalizeSubject } from "./subject";

export type IngestSource = "smtp" | "imap" | "webhook" | "local" | "import" | "linked";

export type IngestOptions = {
  source: IngestSource;
  envelope?: { mailFrom?: string | null; rcptTo?: string[]; remoteIp?: string | null; helo?: string | null };
  /** Authentication results computed by Mailed itself (built-in SMTP receiver). */
  authResults?: AuthResults | null;
  /** Import into these mailboxes regardless of recipients (data import). */
  targetUserIds?: string[];
  importFolder?: Folder;
  /** Overrides the received time (imports, linked accounts and development fixtures). */
  receivedAt?: Date;
  /** Fetched from a linked account (Gmail, Outlook…) into `targetUserIds`. */
  linked?: {
    accountId: string;
    address: string;
    labelId: string | null;
    /** Already read at the provider. */
    seen: boolean;
    /** Part of the initial history import: stored quietly, without rules or notifications. */
    backfill: boolean;
  };
};

export type IngestOutcome = {
  delivered: { userId: string; messageId: string; threadId: string; folder: Folder; duplicate: boolean }[];
  rejected: { address: string; reason: string }[];
};

export class IngestError extends Error {
  constructor(
    message: string,
    public readonly code: "too_large" | "unparseable" | "no_recipients" | "over_quota",
    public readonly permanent = true,
  ) {
    super(message);
    this.name = "IngestError";
  }
}

const toList = (v: AddressObject | AddressObject[] | undefined): EmailAddress[] => {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : [v];
  const out: EmailAddress[] = [];
  for (const obj of arr) {
    for (const a of obj.value ?? []) {
      if (a.group) {
        for (const g of a.group) if (g.address) out.push({ name: g.name ?? "", address: normalizeAddress(g.address) });
      } else if (a.address) {
        out.push({ name: a.name ?? "", address: normalizeAddress(a.address) });
      }
    }
  }
  return out;
};

/** Maps "alice+tag@domain" to the mailbox "alice@domain". */
export function canonicalMailbox(address: string): string {
  const domain = domainOf(address);
  const local = localPartOf(address).split("+")[0];
  return `${local}@${domain}`;
}

export async function findLocalUsers(addresses: string[]) {
  const canonical = [...new Set(addresses.map(normalizeAddress).filter((a) => isLocalDomain(domainOf(a))).map(canonicalMailbox))];
  if (canonical.length === 0) return [];
  return db.select({ id: users.id, address: users.address, quotaBytes: users.quotaBytes }).from(users).where(inArray(users.address, canonical));
}

export async function mailboxUsage(userId: string, conn: Pick<typeof db, "select"> = db): Promise<number> {
  const [row] = await conn
    .select({ used: sql<number>`coalesce(sum(${messages.sizeBytes}), 0)::bigint` })
    .from(messages)
    .where(eq(messages.userId, userId));
  return Number(row?.used ?? 0);
}

function looksExecutable(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0x4d && buf[1] === 0x5a) return true; // MZ (Windows PE)
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true; // ELF
  if (buf[0] === 0xcf && buf[1] === 0xfa && buf[2] === 0xed && buf[3] === 0xfe) return true; // Mach-O
  return false;
}

type Prepared = {
  parsed: ParsedMail;
  raw: Buffer;
  headers: Record<string, string[]>;
  from: EmailAddress;
  replyTo: EmailAddress[];
  to: EmailAddress[];
  cc: EmailAddress[];
  subject: string;
  text: string;
  rawHtml: string | null;
  safeHtml: string | null;
  hasRemoteContent: boolean;
  snippet: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  dateHeader: Date | null;
  auth: AuthResults;
  listId: string | null;
  listUnsubscribe: string | null;
  attachments: { id: string; filename: string; contentType: string; size: number; content: Buffer; contentId: string | null; inline: boolean; dangerous: boolean; sha256: string }[];
};

/** How stored messages are parsed; shared with the HTML re-render tool. */
export const PARSE_OPTIONS = { skipImageLinks: true, skipTextToHtml: true, skipTextLinks: true, keepCidLinks: true } as const;

async function prepare(raw: Buffer, opts: IngestOptions): Promise<Prepared> {
  let parsed: ParsedMail;
  try {
    parsed = await simpleParser(raw, PARSE_OPTIONS);
  } catch (err) {
    throw new IngestError(`Unparseable message: ${(err as Error).message}`, "unparseable");
  }
  const headers = headerMap(parsed);
  const fromList = toList(parsed.from);
  const from = fromList[0] ?? { name: "", address: normalizeAddress(opts.envelope?.mailFrom ?? "") };
  const rawHtml = typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : null;
  const text = (parsed.text && parsed.text.trim()) || (rawHtml ? htmlToText(rawHtml) : "");
  const safeHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : null;
  const hasRemoteContent = safeHtml ? referencesRemoteContent(safeHtml) : false;

  const atts: Prepared["attachments"] = parsed.attachments
    .filter((a) => a.contentType !== "message/delivery-status")
    .slice(0, 100)
    .map((a, i) => {
      const filename = (a.filename || `attachment-${i + 1}`).replace(/[\r\n\0]/g, "").slice(0, 255);
      const content = a.content as Buffer;
      return {
        id: randomUUID(),
        filename,
        contentType: (a.contentType || "application/octet-stream").slice(0, 200),
        size: a.size ?? content.length,
        content,
        contentId: cleanMessageId(a.contentId ?? null),
        inline: Boolean(a.related && a.contentId),
        dangerous: isDangerousFilename(filename) || looksExecutable(content),
        sha256: sha256Hex(content),
      };
    });

  const auth = opts.authResults ?? parseAuthenticationResults(headers) ?? {};
  return {
    parsed,
    raw,
    headers,
    from,
    replyTo: toList(parsed.replyTo),
    to: toList(parsed.to),
    cc: toList(parsed.cc),
    subject: (parsed.subject ?? "").replace(/[\r\n]+/g, " ").slice(0, 998),
    text: text.slice(0, 1_000_000),
    rawHtml,
    safeHtml,
    hasRemoteContent,
    snippet: makeSnippet(text),
    messageId: cleanMessageId(parsed.messageId ?? null),
    inReplyTo: cleanMessageId(typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : null),
    references: parseReferences(parsed.references as string | string[] | undefined),
    dateHeader: parsed.date && !Number.isNaN(parsed.date.getTime()) ? parsed.date : null,
    auth,
    listId: headers["list-id"]?.[0]?.slice(0, 500) ?? null,
    listUnsubscribe: headers["list-unsubscribe"]?.[0]?.slice(0, 2000) ?? null,
    attachments: atts,
  };
}

function recipientCandidates(p: Prepared, opts: IngestOptions): string[] {
  if (opts.envelope?.rcptTo?.length) return opts.envelope.rcptTo;
  const fromHeaders = ["delivered-to", "x-original-to", "envelope-to", "x-forwarded-to"]
    .flatMap((h) => p.headers[h] ?? [])
    .flatMap((v) => v.split(/[,\s]+/))
    .map((v) => v.replace(/[<>]/g, ""))
    .filter((v) => v.includes("@"));
  return [...fromHeaders, ...p.to.map((a) => a.address), ...p.cc.map((a) => a.address)];
}

async function resolveThread(tx: Tx, userId: string, p: Prepared, date: Date) {
  // Our own Message-ID is included so a copy delivered to the sender's own
  // mailbox joins the conversation of the sent message.
  const ids = [...new Set([...(p.inReplyTo ? [p.inReplyTo] : []), ...p.references, ...(p.messageId ? [p.messageId] : [])])];
  let threadId: string | null = null;
  let repliesToUser = false;
  if (ids.length > 0) {
    const rows = await tx
      .select({ threadId: messages.threadId, direction: messages.direction })
      .from(messages)
      .where(and(eq(messages.userId, userId), inArray(messages.messageIdHeader, ids)))
      .orderBy(desc(messages.date))
      .limit(20);
    threadId = rows[0]?.threadId ?? null;
    repliesToUser = rows.some((r) => r.direction === "outbound");
  }
  if (threadId) {
    await tx
      .update(threads)
      .set({ lastMessageAt: sql`greatest(${threads.lastMessageAt}, ${date.toISOString()}::timestamptz)` })
      .where(and(eq(threads.id, threadId), eq(threads.userId, userId)));
    return { threadId, repliesToUser };
  }
  const [t] = await tx
    .insert(threads)
    .values({ userId, subject: normalizeSubject(p.subject), lastMessageAt: date })
    .returning({ id: threads.id });
  return { threadId: t.id, repliesToUser };
}

function applyRuleActions(
  actions: RuleAction[],
  state: { folder: Folder; isRead: boolean; isStarred: boolean; isImportant: boolean; category: Category; labelIds: Set<string> },
) {
  for (const a of actions) {
    switch (a.type) {
      case "apply_label":
        state.labelIds.add(a.labelId);
        break;
      case "mark_read":
        state.isRead = true;
        break;
      case "star":
        state.isStarred = true;
        break;
      case "mark_important":
        state.isImportant = true;
        break;
      case "archive":
        if (state.folder === "inbox") state.folder = "archive";
        break;
      case "trash":
        state.folder = "trash";
        break;
      case "set_category":
        state.category = a.category;
        break;
      case "mark_spam":
        state.folder = "spam";
        break;
      case "never_spam":
        if (state.folder === "spam") state.folder = "inbox";
        break;
    }
  }
}

async function handleBounce(userId: string, p: Prepared) {
  const report = parseDeliveryReport(p.parsed, p.headers);
  if (!report?.originalMessageId || !report.failed) return;
  const [original] = await db
    .select({ id: messages.id, threadId: messages.threadId, subject: messages.subject })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.direction, "outbound"), eq(messages.messageIdHeader, report.originalMessageId)))
    .limit(1);
  if (!original) return;
  const failed = report.recipients.filter((r) => r.action === "failed");
  const detail = failed.length
    ? failed.map((r) => `${r.address}: ${r.diagnostic || r.status}`).join("; ")
    : "The receiving server reported a delivery failure.";
  await db
    .update(messages)
    .set({ sendStatus: "bounced", sendError: detail.slice(0, 1000), updatedAt: new Date() })
    .where(eq(messages.id, original.id));
  await createNotification(userId, {
    type: "bounce",
    title: "Message not delivered",
    body: `"${original.subject || "(no subject)"}" could not be delivered. ${detail}`.slice(0, 500),
    threadId: original.threadId,
    messageId: original.id,
  });
  await publishUserEvent(userId, { type: "send.status", messageId: original.id, threadId: original.threadId, status: "bounced", error: detail });
}

/**
 * Stores an inbound RFC 5322 message for every local recipient. Idempotent:
 * re-delivering the same message (retries, IMAP re-sync, webhook replays) is
 * detected per mailbox and skipped.
 */
export async function ingestRawMessage(raw: Buffer, opts: IngestOptions): Promise<IngestOutcome> {
  const maxBytes = env().MAX_MESSAGE_SIZE_MB * 1024 * 1024 * 1.4; // MIME encoding overhead
  if (raw.length > maxBytes) throw new IngestError("Message exceeds the maximum size", "too_large");

  const p = await prepare(raw, opts);
  const outcome: IngestOutcome = { delivered: [], rejected: [] };

  let targets: { id: string; address: string; quotaBytes: number }[];
  if (opts.targetUserIds?.length) {
    targets = await db.select({ id: users.id, address: users.address, quotaBytes: users.quotaBytes }).from(users).where(inArray(users.id, opts.targetUserIds));
  } else {
    const candidates = recipientCandidates(p, opts);
    targets = await findLocalUsers(candidates);
    if (opts.envelope?.rcptTo?.length) {
      const found = new Set(targets.map((t) => t.address));
      for (const r of opts.envelope.rcptTo) {
        if (!found.has(canonicalMailbox(normalizeAddress(r)))) outcome.rejected.push({ address: r, reason: "No such mailbox" });
      }
    }
  }
  if (targets.length === 0) throw new IngestError("No local recipients", "no_recipients");

  // Signals that do not depend on the recipient are computed once.
  const features = extractFeatures({
    fromName: p.from.name,
    fromAddress: p.from.address,
    replyTo: p.replyTo,
    to: p.to,
    cc: p.cc,
    recipientAddress: "",
    subject: p.subject,
    text: p.text,
    html: p.rawHtml,
    headers: p.headers,
    attachments: [],
    auth: p.auth,
    hasMessageId: Boolean(p.messageId),
    dateHeader: p.dateHeader,
    inReplyTo: p.inReplyTo,
    references: p.references,
    repliesToUser: false,
  });
  const isImport = opts.source === "import";
  const linked = opts.linked ?? null;
  // Imports and the first fetch of a linked account's history arrive without rules or notifications.
  const quiet = isImport || Boolean(linked?.backfill);
  let external: ExternalVerdict | null = null;
  let dnsblHits: string[] = [];
  if (!quiet && opts.source !== "local") {
    [external, dnsblHits] = await Promise.all([
      rspamdCheck(raw, { ip: opts.envelope?.remoteIp, from: opts.envelope?.mailFrom, rcpt: opts.envelope?.rcptTo, helo: opts.envelope?.helo }),
      dnsblDomainHits(features.links.domains),
    ]);
  }
  const senderReg = registrableDomain(domainOf(p.from.address) || "unknown.invalid");
  const reputation = await getDomainReputation(senderReg);
  const dedupeKey = `in:${p.messageId ?? `sha256:${sha256Hex(raw)}`}`;

  for (const target of targets) {
    const userId = target.id;
    const storedKeys: string[] = [];
    try {
      const [existing] = await db
        .select({ id: messages.id, threadId: messages.threadId, folder: messages.folder })
        .from(messages)
        .where(and(eq(messages.userId, userId), eq(messages.dedupeKey, dedupeKey)))
        .limit(1);
      if (existing) {
        outcome.delivered.push({ userId, messageId: existing.id, threadId: existing.threadId, folder: existing.folder, duplicate: true });
        continue;
      }

      const used = await mailboxUsage(userId);
      if (used + raw.length > target.quotaBytes) {
        outcome.rejected.push({ address: target.address, reason: "Mailbox is full" });
        await createNotification(userId, {
          type: "system",
          title: "Your mailbox is full",
          body: `A message from ${p.from.address || "an unknown sender"} could not be delivered because your storage is full.`,
        });
        continue;
      }

      const [rel, list, catOverride, settings, rules] = await Promise.all([
        senderRelationship(userId, p.from.address),
        senderListStatus(userId, p.from.address),
        senderCategoryOverride(userId, p.from.address),
        db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1).then((r) => r[0]),
        db.select().from(emailRules).where(and(eq(emailRules.userId, userId), eq(emailRules.enabled, true))),
      ]);

      const receivedAt = opts.receivedAt ?? (isImport ? (p.dateHeader ?? new Date()) : new Date());
      const rawKey = `${userPrefix(userId)}raw/${randomUUID()}.eml`;
      await storage().put(rawKey, raw, "message/rfc822");
      storedKeys.push(rawKey);
      for (const a of p.attachments) {
        const key = `${userPrefix(userId)}att/${a.id}`;
        await storage().put(key, a.content, a.contentType);
        storedKeys.push(key);
      }

      const result = await db.transaction(async (tx) => {
        const { threadId, repliesToUser } = await resolveThread(tx, userId, p, receivedAt);
        const cmsg: ClassifierMessage = {
          fromName: p.from.name,
          fromAddress: p.from.address,
          replyTo: p.replyTo,
          to: p.to,
          cc: p.cc,
          recipientAddress: linked?.address ?? target.address,
          subject: p.subject,
          text: p.text,
          html: p.rawHtml,
          headers: p.headers,
          attachments: p.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType, size: a.size })),
          auth: p.auth,
          hasMessageId: Boolean(p.messageId),
          dateHeader: p.dateHeader,
          inReplyTo: p.inReplyTo,
          references: p.references,
          repliesToUser,
        };
        const bayes = await bayesLogOdds(userId, bayesTokensFor(cmsg, features.links), tx);
        const verdict = scoreMessage(cmsg, {
          senderKnown: rel.known,
          senderInteractions: rel.interactions,
          senderList: list,
          senderCategory: catOverride,
          domainReputation: reputation,
          bayes,
          external,
          dnsblHits,
        });

        // Imported mail written by the mailbox owner belongs in Sent.
        const ownImported = (isImport && p.from.address === target.address) || (linked !== null && p.from.address === linked.address);
        const state = {
          // The provider already filtered spam out of a linked inbox; Mailed's score still drives warnings.
          folder: (ownImported ? "sent" : isImport ? (opts.importFolder ?? "inbox") : verdict.isSpam && !linked ? "spam" : "inbox") as Folder,
          isRead: isImport || ownImported || Boolean(linked?.seen),
          isStarred: false,
          isImportant: verdict.isImportant,
          category: verdict.category,
          labelIds: new Set<string>(linked?.labelId ? [linked.labelId] : []),
        };
        if (!quiet) {
          const { actions } = evaluateRules(rules, {
            from: `${p.from.name} ${p.from.address}`,
            to: [...p.to, ...p.cc].map((a) => `${a.name} ${a.address}`).join(", "),
            subject: p.subject,
            body: p.text.slice(0, 100_000),
            hasAttachment: p.attachments.some((a) => !a.inline),
            listId: p.listId ?? "",
          });
          applyRuleActions(actions, state);
        }
        if (state.category !== verdict.category) verdict.classification.category = { ...verdict.classification.category, value: state.category, source: "rule" };

        const [msg] = await tx
          .insert(messages)
          .values({
            userId,
            threadId,
            direction: ownImported ? "outbound" : "inbound",
            sendStatus: ownImported ? "sent" : null,
            sentAt: ownImported ? receivedAt : null,
            folder: state.folder,
            restoreFolder: state.folder === "spam" || state.folder === "trash" ? "inbox" : null,
            category: state.category,
            messageIdHeader: p.messageId,
            inReplyTo: p.inReplyTo,
            referencesHeader: p.references,
            dedupeKey,
            fromName: p.from.name.slice(0, 300),
            fromAddress: p.from.address.slice(0, 320),
            replyTo: p.replyTo.map((r) => r.address).join(", ").slice(0, 1000) || null,
            subject: p.subject,
            snippet: p.snippet,
            textBody: p.text,
            htmlBody: p.safeHtml,
            hasRemoteContent: p.hasRemoteContent,
            hasAttachments: p.attachments.some((a) => !a.inline),
            sizeBytes: raw.length,
            rawKey,
            date: receivedAt,
            sortDate: receivedAt,
            isRead: state.isRead,
            isStarred: state.isStarred,
            isImportant: state.isImportant,
            spamScore: verdict.spamProbability,
            isSuspicious: verdict.isSuspicious,
            classification: verdict.classification,
            security: verdict.security,
            listId: p.listId,
            listUnsubscribe: p.listUnsubscribe,
            trashedAt: state.folder === "trash" ? new Date() : null,
            linkedAccountId: linked?.accountId ?? null,
          })
          .returning({ id: messages.id });

        const recipients = [
          ...p.to.map((a, i) => ({ kind: "to" as const, a, i })),
          ...p.cc.map((a, i) => ({ kind: "cc" as const, a, i })),
        ].slice(0, 500);
        if (recipients.length > 0) {
          await tx.insert(messageRecipients).values(
            recipients.map(({ kind, a, i }) => ({ messageId: msg.id, userId, kind, name: a.name.slice(0, 300), address: a.address.slice(0, 320), position: i })),
          );
        }
        if (p.attachments.length > 0) {
          await tx.insert(attachmentsTable).values(
            p.attachments.map((a) => ({
              id: a.id,
              userId,
              messageId: msg.id,
              filename: a.filename,
              contentType: a.contentType,
              sizeBytes: a.size,
              storageKey: `${userPrefix(userId)}att/${a.id}`,
              contentId: a.contentId,
              isInline: a.inline,
              isDangerous: a.dangerous,
              sha256: a.sha256,
            })),
          );
        }
        if (state.labelIds.size > 0) {
          const owned = await tx
            .select({ id: labels.id })
            .from(labels)
            .where(and(eq(labels.userId, userId), inArray(labels.id, [...state.labelIds])));
          if (owned.length > 0) {
            await tx.insert(messageLabels).values(owned.map((l) => ({ messageId: msg.id, labelId: l.id, userId }))).onConflictDoNothing();
          }
        }
        return { messageId: msg.id, threadId, folder: state.folder, category: state.category, isRead: state.isRead };
      });

      storedKeys.length = 0;
      outcome.delivered.push({ userId, messageId: result.messageId, threadId: result.threadId, folder: result.folder, duplicate: false });

      if (!quiet) {
        await handleBounce(userId, p);
        const muted = settings?.mutedCategories ?? [];
        const notify = result.folder === "inbox" && !result.isRead && (settings?.notifyInApp ?? true) && !muted.includes(result.category);
        if (notify) {
          await createNotification(userId, {
            type: "new_mail",
            title: p.from.name || p.from.address || "New message",
            body: p.subject || "(no subject)",
            threadId: result.threadId,
            messageId: result.messageId,
          });
        }
        await publishUserEvent(userId, {
          type: "mail.new",
          threadId: result.threadId,
          messageId: result.messageId,
          notify,
          title: (p.from.name || p.from.address).slice(0, 120),
          body: (p.subject || "(no subject)").slice(0, 200),
          category: result.category,
        });
      }
    } catch (err) {
      await Promise.all(storedKeys.map((k) => storage().delete(k).catch(() => undefined)));
      if (isUniqueViolation(err)) {
        // Concurrent delivery of the same message won the race.
        logger.info({ userId }, "duplicate inbound message skipped");
        continue;
      }
      logger.error({ err, userId }, "failed to store inbound message");
      throw err;
    }
  }

  if (!quiet && senderReg && outcome.delivered.some((d) => !d.duplicate)) {
    await db
      .insert(domainReputation)
      .values({ domain: senderReg, messagesSeen: 1 })
      .onConflictDoUpdate({
        target: domainReputation.domain,
        set: { messagesSeen: sql`${domainReputation.messagesSeen} + 1`, lastSeenAt: new Date() },
      });
  }

  logger.info(
    {
      source: opts.source,
      delivered: outcome.delivered.filter((d) => !d.duplicate).length,
      duplicates: outcome.delivered.filter((d) => d.duplicate).length,
      rejected: outcome.rejected.length,
      size: raw.length,
    },
    "inbound message processed",
  );
  return outcome;
}
