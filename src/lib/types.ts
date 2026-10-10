/**
 * DTOs shared by API routes and client components. This module must not
 * import server-only code.
 */

export const FOLDERS = ["inbox", "sent", "drafts", "archive", "spam", "trash"] as const;
export type FolderName = (typeof FOLDERS)[number];

export const CATEGORIES = ["primary", "social", "promotions", "updates", "forums", "ads"] as const;
export type CategoryName = (typeof CATEGORIES)[number];

export const SYSTEM_VIEWS = [
  "inbox",
  "starred",
  "snoozed",
  "important",
  "sent",
  "scheduled",
  "drafts",
  "archive",
  "spam",
  "trash",
  "social",
  "promotions",
  "updates",
  "forums",
  "ads",
  "all",
] as const;
export type SystemView = (typeof SYSTEM_VIEWS)[number];

export type ViewRef = { kind: "system"; view: SystemView } | { kind: "label"; labelId: string } | { kind: "search"; query: string };

export type AddressDTO = { name: string; address: string };

export type LabelDTO = { id: string; name: string; color: string; unread?: number; total?: number };

export type ThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  date: string;
  participants: { name: string; address: string; isMe: boolean; unread: boolean }[];
  recipients: AddressDTO[];
  messageCount: number;
  unread: boolean;
  starred: boolean;
  important: boolean;
  hasAttachments: boolean;
  hasDraft: boolean;
  category: CategoryName;
  folder: FolderName;
  suspicious: boolean;
  spamScore: number;
  snoozedUntil: string | null;
  sendStatus: string | null;
  scheduledAt: string | null;
  labels: LabelDTO[];
  latestMessageId: string;
};

export type ThreadListResponse = {
  threads: ThreadSummary[];
  nextCursor: string | null;
  total: number;
};

export type AttachmentDTO = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  isInline: boolean;
  isDangerous: boolean;
};

export type SecurityDTO = {
  phishing: boolean;
  phishingReasons: string[];
  unknownSender: boolean;
  spoofedDisplayName: boolean;
  replyToMismatch: boolean;
  suspiciousLinks: { href: string; text: string; reasons: string[] }[];
  dangerousAttachments: string[];
  auth: { spf?: string; dkim?: string; dmarc?: string };
};

export type ClassificationDTO = {
  spamProbability: number;
  spamReasons: { code: string; label: string; weight: number }[];
  spamSource: string;
  category: CategoryName;
  categoryScores: Partial<Record<CategoryName, number>>;
  categoryReasons: string[];
  categorySource: string;
};

export type MessageDTO = {
  id: string;
  threadId: string;
  direction: "inbound" | "outbound";
  folder: FolderName;
  category: CategoryName;
  from: AddressDTO;
  replyTo: string | null;
  to: AddressDTO[];
  cc: AddressDTO[];
  bcc: AddressDTO[];
  subject: string;
  snippet: string;
  text: string;
  html: string | null;
  hasRemoteContent: boolean;
  date: string;
  isRead: boolean;
  isStarred: boolean;
  isImportant: boolean;
  isSuspicious: boolean;
  snoozedUntil: string | null;
  sendStatus: string | null;
  sendError: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  attachments: AttachmentDTO[];
  labels: LabelDTO[];
  security: SecurityDTO | null;
  classification: ClassificationDTO | null;
  listUnsubscribe: string | null;
  messageIdHeader: string | null;
  isDraft: boolean;
  draftContext: { mode: string; sourceMessageId?: string } | null;
  reminder: { id: string; remindAt: string; onlyIfNoReply: boolean } | null;
};

export type ThreadDetail = {
  id: string;
  subject: string;
  messages: MessageDTO[];
  labels: LabelDTO[];
};

export type MailboxCounts = {
  unread: Partial<Record<SystemView, number>>;
  totals: Partial<Record<SystemView, number>>;
  labels: Record<string, { unread: number; total: number }>;
};

export type DraftInput = {
  to: AddressDTO[];
  cc: AddressDTO[];
  bcc: AddressDTO[];
  subject: string;
  html: string;
};

export type SettingsDTO = {
  theme: "light" | "dark" | "system";
  density: "comfortable" | "compact";
  displayName: string | null;
  signatureHtml: string;
  locale: string;
  timeZone: string;
  readingPane: "right" | "off";
  markReadOnOpen: boolean;
  remoteImages: "ask" | "always";
  inboxCategories: boolean;
  undoSendSeconds: number;
  pageSize: number;
  notifyInApp: boolean;
  notifyBrowser: boolean;
  mutedCategories: string[];
};

export type MeDTO = {
  id: string;
  firstName: string;
  lastName: string;
  address: string;
  recoveryEmail: string;
  emailVerified: boolean;
  avatarUrl: string | null;
  createdAt: string;
  storage: { usedBytes: number; quotaBytes: number };
  mail: { outboundConfigured: boolean; domains: string[] };
};

export type ContactDTO = {
  id: string;
  name: string;
  address: string;
  isFavorite: boolean;
  interactionCount: number;
  lastInteractionAt: string | null;
  source: string;
  notes: string;
};

export type ApiErrorBody = { error: { code: string; message: string; details?: unknown } };

export const LABEL_COLORS = ["slate", "blue", "teal", "green", "amber", "orange", "red", "pink", "violet", "brown"] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];
