import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const folderEnum = pgEnum("folder", ["inbox", "sent", "drafts", "archive", "spam", "trash"]);
export const categoryEnum = pgEnum("category", [
  "primary",
  "social",
  "promotions",
  "updates",
  "forums",
  "ads",
]);
export const directionEnum = pgEnum("direction", ["inbound", "outbound"]);
export const sendStatusEnum = pgEnum("send_status", [
  "draft",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "failed",
  "bounced",
]);
export const recipientKindEnum = pgEnum("recipient_kind", ["to", "cc", "bcc"]);
export const authTokenTypeEnum = pgEnum("auth_token_type", ["verify_email", "reset_password"]);
export const themeEnum = pgEnum("theme", ["light", "dark", "system"]);
export const densityEnum = pgEnum("density", ["comfortable", "compact"]);
export const readingPaneEnum = pgEnum("reading_pane", ["right", "off"]);
export const remoteImagesEnum = pgEnum("remote_images", ["ask", "always"]);
export const senderListKindEnum = pgEnum("sender_list_kind", ["blocked", "trusted"]);
export const contactSourceEnum = pgEnum("contact_source", ["auto", "manual", "import"]);
export const ruleMatchEnum = pgEnum("rule_match", ["all", "any"]);
export const notificationTypeEnum = pgEnum("notification_type", [
  "new_mail",
  "reminder",
  "send_failed",
  "bounce",
  "security",
  "system",
]);
export const jobStatusEnum = pgEnum("job_status", ["pending", "running", "completed", "failed"]);

export type Folder = (typeof folderEnum.enumValues)[number];
export type Category = (typeof categoryEnum.enumValues)[number];
export type SendStatus = (typeof sendStatusEnum.enumValues)[number];
export type RecipientKind = (typeof recipientKindEnum.enumValues)[number];

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** The Mailed mailbox address, always stored lower-case. */
    address: text("address").notNull(),
    /** External address used for verification and password recovery, lower-case. */
    recoveryEmail: text("recovery_email").notNull(),
    emailVerifiedAt: ts("email_verified_at"),
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: ts("password_changed_at"),
    avatarKey: text("avatar_key"),
    quotaBytes: bigint("quota_bytes", { mode: "number" }).notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_address_key").on(t.address),
    uniqueIndex("users_recovery_email_key").on(t.recoveryEmail),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token. The token itself is never stored. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    /** SHA-256 of the token sent by email. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: authTokenTypeEnum("type").notNull(),
    email: text("email").notNull(),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_user_type_idx").on(t.userId, t.type)],
);

export const userSettings = pgTable("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  theme: themeEnum("theme").notNull().default("light"),
  density: densityEnum("density").notNull().default("comfortable"),
  displayName: text("display_name"),
  signatureHtml: text("signature_html").notNull().default(""),
  locale: text("locale").notNull().default("en-US"),
  timeZone: text("time_zone").notNull().default("UTC"),
  readingPane: readingPaneEnum("reading_pane").notNull().default("right"),
  markReadOnOpen: boolean("mark_read_on_open").notNull().default(true),
  remoteImages: remoteImagesEnum("remote_images").notNull().default("ask"),
  inboxCategories: boolean("inbox_categories").notNull().default(true),
  undoSendSeconds: integer("undo_send_seconds").notNull().default(5),
  pageSize: integer("page_size").notNull().default(50),
  notifyInApp: boolean("notify_in_app").notNull().default(true),
  notifyBrowser: boolean("notify_browser").notNull().default(false),
  mutedCategories: text("muted_categories")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const securityEvents = pgTable(
  "security_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("security_events_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Mail                                                                */
/* ------------------------------------------------------------------ */

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull().default(""),
    lastMessageAt: ts("last_message_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("threads_user_last_idx").on(t.userId, t.lastMessageAt)],
);

export type SpamReason = { code: string; label: string; weight: number };

export type MessageClassification = {
  version: number;
  spam: { probability: number; reasons: SpamReason[]; source: "model" | "user" | "rule" | "list" };
  category: {
    value: Category;
    scores: Partial<Record<Category, number>>;
    reasons: string[];
    source: "model" | "user" | "rule";
  };
  external?: { provider: string; score: number; action?: string } | null;
  /** Set once the message has been used to train the user's model. */
  trainedAs?: "spam" | "ham";
};

export type SuspiciousLink = { href: string; text: string; reasons: string[] };

export type MessageSecurity = {
  phishing: boolean;
  phishingReasons: string[];
  unknownSender: boolean;
  spoofedDisplayName: boolean;
  replyToMismatch: boolean;
  suspiciousLinks: SuspiciousLink[];
  dangerousAttachments: string[];
  auth: { spf?: string; dkim?: string; dmarc?: string; source?: string };
};

export type DraftContext = {
  mode: "new" | "reply" | "reply_all" | "forward";
  sourceMessageId?: string;
  /** Sanitised quoted/forwarded content appended below the body when sent. */
  quotedHtml?: string;
};

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    direction: directionEnum("direction").notNull(),
    folder: folderEnum("folder").notNull(),
    /** Folder to return to when restoring from Trash or Spam. */
    restoreFolder: folderEnum("restore_folder"),
    category: categoryEnum("category").notNull().default("primary"),
    messageIdHeader: text("message_id_header"),
    inReplyTo: text("in_reply_to"),
    referencesHeader: text("references_header")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Per-user idempotency key for inbound mail (Message-ID or content hash). */
    dedupeKey: text("dedupe_key"),
    fromName: text("from_name").notNull().default(""),
    fromAddress: text("from_address").notNull().default(""),
    replyTo: text("reply_to"),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    textBody: text("text_body").notNull().default(""),
    /** Sanitized HTML, safe to render inside the sandboxed reader frame. */
    htmlBody: text("html_body"),
    hasRemoteContent: boolean("has_remote_content").notNull().default(false),
    hasAttachments: boolean("has_attachments").notNull().default(false),
    sizeBytes: integer("size_bytes").notNull().default(0),
    rawKey: text("raw_key"),
    date: ts("date").notNull().defaultNow(),
    /** Ordering key; equals `date` but moves forward when a snooze or reminder resurfaces the message. */
    sortDate: ts("sort_date").notNull().defaultNow(),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    isImportant: boolean("is_important").notNull().default(false),
    snoozedUntil: ts("snoozed_until"),
    spamScore: real("spam_score").notNull().default(0),
    isSuspicious: boolean("is_suspicious").notNull().default(false),
    classification: jsonb("classification").$type<MessageClassification>(),
    security: jsonb("security").$type<MessageSecurity>(),
    listId: text("list_id"),
    listUnsubscribe: text("list_unsubscribe"),
    sendStatus: sendStatusEnum("send_status"),
    sendError: text("send_error"),
    sendAttempts: integer("send_attempts").notNull().default(0),
    scheduledAt: ts("scheduled_at"),
    sentAt: ts("sent_at"),
    trashedAt: ts("trashed_at"),
    draftContext: jsonb("draft_context").$type<DraftContext>(),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple'::regconfig, coalesce(subject, '')), 'A') || setweight(to_tsvector('simple'::regconfig, coalesce(from_name, '') || ' ' || coalesce(from_address, '')), 'B') || setweight(to_tsvector('simple'::regconfig, left(coalesce(text_body, ''), 200000)), 'C')`,
    ),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_user_folder_date_idx").on(t.userId, t.folder, t.sortDate),
    index("messages_user_category_idx").on(t.userId, t.category, t.folder, t.sortDate),
    index("messages_thread_idx").on(t.threadId, t.date),
    index("messages_user_msgid_idx").on(t.userId, t.messageIdHeader),
    index("messages_user_from_idx").on(t.userId, t.fromAddress),
    index("messages_starred_idx").on(t.userId, t.sortDate).where(sql`${t.isStarred}`),
    index("messages_unread_idx").on(t.userId, t.folder).where(sql`not ${t.isRead}`),
    index("messages_snoozed_idx").on(t.snoozedUntil).where(sql`${t.snoozedUntil} is not null`),
    index("messages_trashed_idx").on(t.folder, t.trashedAt),
    index("messages_search_idx").using("gin", t.searchVector),
    uniqueIndex("messages_user_dedupe_key").on(t.userId, t.dedupeKey),
  ],
);

export const messageRecipients = pgTable(
  "message_recipients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: recipientKindEnum("kind").notNull(),
    name: text("name").notNull().default(""),
    address: text("address").notNull(),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("recipients_message_idx").on(t.messageId),
    index("recipients_user_address_idx").on(t.userId, t.address),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    contentId: text("content_id"),
    isInline: boolean("is_inline").notNull().default(false),
    isDangerous: boolean("is_dangerous").notNull().default(false),
    sha256: text("sha256").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("attachments_message_idx").on(t.messageId), index("attachments_user_idx").on(t.userId)],
);

export const labels = pgTable(
  "labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("slate"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("labels_user_name_key").on(t.userId, sql`lower(${t.name})`)],
);

export const messageLabels = pgTable(
  "message_labels",
  {
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.messageId, t.labelId] }),
    index("message_labels_label_idx").on(t.labelId),
  ],
);

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    address: text("address").notNull(),
    isFavorite: boolean("is_favorite").notNull().default(false),
    interactionCount: integer("interaction_count").notNull().default(0),
    lastInteractionAt: ts("last_interaction_at"),
    source: contactSourceEnum("source").notNull().default("auto"),
    notes: text("notes").notNull().default(""),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("contacts_user_address_key").on(t.userId, t.address)],
);

export const senderLists = pgTable(
  "sender_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: senderListKindEnum("kind").notNull(),
    /** Either a full address ("a@b.com") or a domain prefixed with "@" ("@b.com"). */
    pattern: text("pattern").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("sender_lists_user_pattern_key").on(t.userId, t.pattern)],
);

/** Category corrections learned from the user ("always put this sender in Updates"). */
export const senderCategories = pgTable(
  "sender_categories",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pattern: text("pattern").notNull(),
    category: categoryEnum("category").notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pattern] })],
);

export type RuleCondition = {
  field: "from" | "to" | "subject" | "body" | "has_attachment" | "list_id";
  op: "contains" | "not_contains" | "equals" | "ends_with" | "is_true";
  value: string;
};

export type RuleAction =
  | { type: "apply_label"; labelId: string }
  | { type: "mark_read" }
  | { type: "star" }
  | { type: "archive" }
  | { type: "trash" }
  | { type: "mark_important" }
  | { type: "set_category"; category: Category }
  | { type: "mark_spam" }
  | { type: "never_spam" };

export const emailRules = pgTable(
  "email_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    match: ruleMatchEnum("match").notNull().default("all"),
    conditions: jsonb("conditions").$type<RuleCondition[]>().notNull(),
    actions: jsonb("actions").$type<RuleAction[]>().notNull(),
    stopProcessing: boolean("stop_processing").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("email_rules_user_idx").on(t.userId, t.position)],
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    remindAt: ts("remind_at").notNull(),
    onlyIfNoReply: boolean("only_if_no_reply").notNull().default(false),
    note: text("note").notNull().default(""),
    firedAt: ts("fired_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("reminders_due_idx").on(t.remindAt).where(sql`${t.firedAt} is null`),
    index("reminders_user_idx").on(t.userId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    threadId: uuid("thread_id").references(() => threads.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => messages.id, { onDelete: "cascade" }),
    readAt: ts("read_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Classification                                                      */
/* ------------------------------------------------------------------ */

export const classifierTokens = pgTable(
  "classifier_tokens",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    spamCount: integer("spam_count").notNull().default(0),
    hamCount: integer("ham_count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.token] })],
);

export const classifierStats = pgTable("classifier_stats", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  spamDocs: integer("spam_docs").notNull().default(0),
  hamDocs: integer("ham_docs").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Aggregated, non-personal sending-domain reputation across all mailboxes. */
export const domainReputation = pgTable("domain_reputation", {
  domain: text("domain").primaryKey(),
  messagesSeen: integer("messages_seen").notNull().default(0),
  spamReports: integer("spam_reports").notNull().default(0),
  hamReports: integer("ham_reports").notNull().default(0),
  firstSeenAt: ts("first_seen_at").notNull().defaultNow(),
  lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Infrastructure                                                      */
/* ------------------------------------------------------------------ */

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  resetAt: ts("reset_at").notNull(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: jobStatusEnum("status").notNull().default("pending"),
    runAt: ts("run_at").notNull().defaultNow(),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),
    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    /** Prevents enqueueing the same logical job twice while it is pending. */
    uniqueKey: text("unique_key"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
  },
  (t) => [
    index("jobs_pending_idx").on(t.status, t.runAt),
    uniqueIndex("jobs_unique_key").on(t.uniqueKey).where(sql`${t.status} in ('pending', 'running')`),
  ],
);

export const imapSyncState = pgTable("imap_sync_state", {
  id: text("id").primaryKey(),
  uidValidity: text("uid_validity"),
  lastUid: bigint("last_uid", { mode: "number" }).notNull().default(0),
  lastSyncAt: ts("last_sync_at"),
  lastError: text("last_error"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
});

export type User = typeof users.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type EmailRule = typeof emailRules.$inferSelect;
export type Job = typeof jobs.$inferSelect;
