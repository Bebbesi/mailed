import {
  Archive,
  CalendarClock,
  Clock,
  File,
  Inbox,
  Mail,
  Megaphone,
  MessagesSquare,
  Newspaper,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
  Users,
  BellRing,
  type LucideIcon,
} from "lucide-react";
import type { SystemView, ViewRef } from "@/lib/types";

export type ViewMeta = { label: string; icon: LucideIcon; empty: { title: string; description: string } };

export const VIEW_META: Record<SystemView, ViewMeta> = {
  inbox: { label: "Inbox", icon: Inbox, empty: { title: "You're all caught up", description: "New messages will appear here as they arrive." } },
  starred: { label: "Starred", icon: Star, empty: { title: "No starred messages", description: "Star messages to find them quickly later." } },
  snoozed: { label: "Snoozed", icon: Clock, empty: { title: "Nothing snoozed", description: "Snoozed conversations come back to your inbox at the time you choose." } },
  important: { label: "Important", icon: BellRing, empty: { title: "Nothing marked important", description: "Messages from people you correspond with often show up here." } },
  sent: { label: "Sent", icon: Send, empty: { title: "No sent messages", description: "Messages you send will appear here." } },
  scheduled: { label: "Scheduled", icon: CalendarClock, empty: { title: "Nothing scheduled", description: "Use Schedule send to deliver a message later." } },
  drafts: { label: "Drafts", icon: File, empty: { title: "No drafts", description: "Messages you start writing are saved here automatically." } },
  archive: { label: "Archive", icon: Archive, empty: { title: "Archive is empty", description: "Archived conversations leave your inbox but stay searchable." } },
  spam: { label: "Spam", icon: ShieldAlert, empty: { title: "No spam", description: "Messages here are deleted automatically after 30 days." } },
  trash: { label: "Trash", icon: Trash2, empty: { title: "Trash is empty", description: "Messages in Trash are deleted forever after 30 days." } },
  social: { label: "Social", icon: Users, empty: { title: "No social updates", description: "Notifications from social networks and communities land here." } },
  promotions: { label: "Promotions", icon: Tag, empty: { title: "No promotions", description: "Offers and marketing newsletters land here." } },
  updates: { label: "Updates", icon: Newspaper, empty: { title: "No updates", description: "Receipts, confirmations and account notices land here." } },
  forums: { label: "Forums", icon: MessagesSquare, empty: { title: "No forum messages", description: "Mailing lists and discussion groups land here." } },
  ads: { label: "Ads", icon: Megaphone, empty: { title: "No ads", description: "Messages explicitly labelled as advertising land here." } },
  all: { label: "All mail", icon: Mail, empty: { title: "No mail yet", description: "Every message except Spam and Trash appears here." } },
};

export const CATEGORY_VIEWS = ["social", "promotions", "updates", "forums", "ads"] as const;

export function basePath(view: ViewRef): string {
  if (view.kind === "system") return `/app/${view.view}`;
  if (view.kind === "label") return `/app/label/${view.labelId}`;
  return "/app/search";
}

/** URL of a view, optionally with a conversation open. */
export function viewHref(view: ViewRef, threadId?: string | null): string {
  const path = threadId ? `${basePath(view)}/${threadId}` : basePath(view);
  return view.kind === "search" ? `${path}?q=${encodeURIComponent(view.query)}` : path;
}

export const LABEL_DOT: Record<string, string> = {
  slate: "bg-[#64748b]",
  blue: "bg-[#2f6fdb]",
  teal: "bg-[#1f9d8a]",
  green: "bg-[#3f9142]",
  amber: "bg-[#d29a06]",
  orange: "bg-[#d9622b]",
  red: "bg-[#d33a3a]",
  pink: "bg-[#d0457f]",
  violet: "bg-[#7c5cd6]",
  brown: "bg-[#8b6a4f]",
};

export const LABEL_CHIP: Record<string, string> = {
  slate: "bg-[#64748b]/12 text-[#475569] dark:text-[#a3b1c6]",
  blue: "bg-[#2f6fdb]/12 text-[#1f55b5] dark:text-[#8db1f2]",
  teal: "bg-[#1f9d8a]/12 text-[#147a6b] dark:text-[#6fd2c1]",
  green: "bg-[#3f9142]/12 text-[#2f7232] dark:text-[#8fd092]",
  amber: "bg-[#d29a06]/14 text-[#8f6900] dark:text-[#f0c75e]",
  orange: "bg-[#d9622b]/12 text-[#b14a1a] dark:text-[#f3a07a]",
  red: "bg-[#d33a3a]/12 text-[#b02a2a] dark:text-[#f19595]",
  pink: "bg-[#d0457f]/12 text-[#ad2f64] dark:text-[#f19bc0]",
  violet: "bg-[#7c5cd6]/12 text-[#6041bd] dark:text-[#b9a5f2]",
  brown: "bg-[#8b6a4f]/14 text-[#6e5039] dark:text-[#cfb39b]",
};
