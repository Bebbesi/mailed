"use client";

import Link from "next/link";
import { AlertTriangle, Archive, CalendarClock, Clock, Mail, MailOpen, Paperclip, Star, Trash2 } from "lucide-react";
import { memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip } from "@/components/ui/tooltip";
import { fullDate, listDate } from "@/lib/client/format";
import { LABEL_CHIP, VIEW_META } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import type { ThreadSummary } from "@/lib/types";

function Participants({ t }: { t: ThreadSummary }) {
  if (t.folder === "sent" || t.folder === "drafts" || (t.participants.length > 0 && t.participants.every((p) => p.isMe))) {
    const names = t.recipients.map((r) => r.name || r.address.split("@")[0]);
    return (
      <>
        <span className="font-normal text-ink-subtle">To: </span>
        {names.length ? names.slice(0, 3).join(", ") : "(no recipients)"}
      </>
    );
  }
  const shown = t.participants.slice(-3);
  const multi = shown.length > 1;
  return (
    <>
      {shown.map((p, i) => {
        const full = p.isMe ? "me" : p.name || p.address;
        const label = multi && !p.isMe ? full.split(/[\s@]/)[0] : full;
        return (
          <span key={`${p.address}-${i}`} className={cn(p.unread && "font-semibold text-ink")}>
            {i > 0 ? ", " : ""}
            {label}
          </span>
        );
      })}
    </>
  );
}

type RowProps = {
  thread: ThreadSummary;
  href: string;
  selected: boolean;
  checked: boolean;
  focused: boolean;
  layout: "line" | "stacked";
  density: "comfortable" | "compact";
  prefs: { locale: string; timeZone: string };
  showCategory: boolean;
  onCheck: (id: string, checked: boolean, shift: boolean) => void;
  onStar: (t: ThreadSummary) => void;
  onQuick: (t: ThreadSummary, action: "archive" | "trash" | "read" | "unread") => void;
  onOpen: (t: ThreadSummary) => void;
  quickArchive: boolean;
};

export const ThreadRow = memo(function ThreadRow({
  thread: t,
  href,
  selected,
  checked,
  focused,
  layout,
  density,
  prefs,
  showCategory,
  onCheck,
  onStar,
  onQuick,
  onOpen,
  quickArchive,
}: RowProps) {
  const sender = <Participants t={t} />;
  const count = t.messageCount > 1 ? <span className="ml-1 text-[11px] font-normal text-ink-subtle">{t.messageCount}</span> : null;
  const date =
    t.sendStatus === "scheduled" && t.scheduledAt ? (
      <span className="inline-flex items-center gap-1 text-accent-ink">
        <CalendarClock className="size-3" aria-hidden />
        {listDate(t.scheduledAt, prefs)}
      </span>
    ) : t.snoozedUntil ? (
      <span className="inline-flex items-center gap-1 text-warn">
        <Clock className="size-3" aria-hidden />
        {listDate(t.snoozedUntil, prefs)}
      </span>
    ) : (
      listDate(t.date, prefs)
    );

  const badges = (
    <>
      {t.hasDraft ? <span className="mr-1.5 text-[12px] font-medium text-danger">Draft</span> : null}
      {t.sendStatus === "failed" || t.sendStatus === "bounced" ? (
        <span className="mr-1.5 inline-flex h-4 items-center rounded bg-danger-soft px-1 text-[10px] font-medium text-danger">Not delivered</span>
      ) : null}
      {t.sendStatus === "queued" || t.sendStatus === "sending" ? (
        <span className="mr-1.5 inline-flex h-4 items-center rounded bg-hover px-1 text-[10px] font-medium text-ink-subtle">Sending</span>
      ) : null}
      {showCategory && t.category !== "primary" && t.folder === "inbox" ? (
        <span className="mr-1.5 inline-flex h-4 items-center rounded border border-line px-1 text-[10px] text-ink-subtle">{VIEW_META[t.category].label}</span>
      ) : null}
      {t.labels.slice(0, 3).map((l) => (
        <span key={l.id} className={cn("mr-1.5 inline-flex h-4 max-w-28 items-center truncate rounded px-1.5 text-[10px] font-medium", LABEL_CHIP[l.color] ?? LABEL_CHIP.slate)}>
          {l.name}
        </span>
      ))}
    </>
  );

  const quick = (
    <div className="absolute inset-y-0 right-2 hidden items-center gap-0.5 bg-inherit group-hover:flex">
      {quickArchive ? (
        <Tooltip content="Archive">
          <button type="button" aria-label="Archive" onClick={(e) => (e.preventDefault(), onQuick(t, "archive"))} className="flex size-7 items-center justify-center rounded text-ink-subtle hover:bg-active hover:text-ink">
            <Archive className="size-4" />
          </button>
        </Tooltip>
      ) : null}
      <Tooltip content={t.folder === "trash" ? "Delete forever" : "Delete"}>
        <button type="button" aria-label="Delete" onClick={(e) => (e.preventDefault(), onQuick(t, "trash"))} className="flex size-7 items-center justify-center rounded text-ink-subtle hover:bg-active hover:text-ink">
          <Trash2 className="size-4" />
        </button>
      </Tooltip>
      <Tooltip content={t.unread ? "Mark as read" : "Mark as unread"}>
        <button
          type="button"
          aria-label={t.unread ? "Mark as read" : "Mark as unread"}
          onClick={(e) => (e.preventDefault(), onQuick(t, t.unread ? "read" : "unread"))}
          className="flex size-7 items-center justify-center rounded text-ink-subtle hover:bg-active hover:text-ink"
        >
          {t.unread ? <MailOpen className="size-4" /> : <Mail className="size-4" />}
        </button>
      </Tooltip>
    </div>
  );

  const accessibleName = `${t.unread ? "Unread. " : ""}${t.participants.map((p) => (p.isMe ? "me" : p.name || p.address)).join(", ")}. ${t.subject || "(no subject)"}. ${fullDate(t.date, prefs)}`;

  return (
    <li
      className={cn(
        "group relative border-b border-line",
        selected ? "bg-selected" : checked ? "bg-accent-soft/60" : t.unread ? "bg-surface" : "bg-canvas",
        !selected && "hover:shadow-[inset_1px_0_0_var(--line-strong),inset_-1px_0_0_var(--line-strong)] hover:z-[1]",
        focused && "outline-2 -outline-offset-2 outline-ring",
      )}
      data-thread-id={t.id}
    >
      {t.unread ? <span className="absolute inset-y-0 left-0 w-0.5 bg-accent" aria-hidden /> : null}
      <div className={cn("flex items-start gap-1 pr-3 pl-2", density === "compact" ? "py-1" : layout === "line" ? "py-1.5" : "py-2.5")}>
        <div className={cn("flex shrink-0 items-center", layout === "line" ? "h-7" : "h-6")}>
          <span className="flex size-7 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={checked} onCheckedChange={(v) => onCheck(t.id, v, false)} onClick={(e) => e.shiftKey && (e.preventDefault(), onCheck(t.id, !checked, true))} aria-label={`Select conversation: ${t.subject || "(no subject)"}`} />
          </span>
          <button
            type="button"
            aria-label={t.starred ? "Unstar" : "Star"}
            aria-pressed={t.starred}
            onClick={() => onStar(t)}
            className="flex size-7 items-center justify-center rounded text-ink-subtle hover:text-ink"
          >
            <Star className={cn("size-4", t.starred && "fill-[#e8a317] text-[#e8a317]")} />
          </button>
        </div>
        <Link
          href={href}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey) return;
            e.preventDefault();
            onOpen(t);
          }}
          aria-label={accessibleName}
          aria-current={selected ? "true" : undefined}
          className="min-w-0 flex-1 rounded focus-visible:outline-offset-0"
        >
          {layout === "line" ? (
            <div className="flex h-7 items-center gap-3 text-[13px]">
              <span className={cn("w-44 shrink-0 truncate xl:w-52", t.unread ? "font-semibold text-ink" : "text-ink-muted")}>
                {sender}
                {count}
              </span>
              <span className="flex min-w-0 flex-1 items-center truncate">
                {t.suspicious ? <AlertTriangle className="mr-1.5 size-3.5 shrink-0 text-danger" aria-label="Suspicious" /> : null}
                {badges}
                <span className={cn("truncate", t.unread ? "font-semibold text-ink" : "text-ink-muted")}>{t.subject || "(no subject)"}</span>
                <span className="truncate text-ink-subtle">&nbsp;— {t.snippet}</span>
              </span>
              {t.hasAttachments ? <Paperclip className="size-3.5 shrink-0 text-ink-subtle" aria-label="Has attachments" /> : null}
              <span className={cn("w-16 shrink-0 text-right text-[12px] tabular-nums group-hover:invisible", t.unread ? "font-semibold text-ink" : "text-ink-subtle")}>
                {date}
              </span>
            </div>
          ) : (
            <div className="min-w-0 text-[13px]">
              <div className="flex items-center gap-2">
                <span className={cn("min-w-0 flex-1 truncate", t.unread ? "font-semibold text-ink" : "text-ink-muted")}>
                  {sender}
                  {count}
                </span>
                {t.hasAttachments ? <Paperclip className="size-3.5 shrink-0 text-ink-subtle" aria-label="Has attachments" /> : null}
                <span className={cn("shrink-0 text-[12px] tabular-nums", t.unread ? "font-semibold text-ink" : "text-ink-subtle")}>{date}</span>
              </div>
              <div className="mt-0.5 flex items-center truncate">
                {t.suspicious ? <AlertTriangle className="mr-1.5 size-3.5 shrink-0 text-danger" aria-label="Suspicious" /> : null}
                {badges}
                <span className={cn("truncate", t.unread ? "font-semibold text-ink" : "text-ink-muted")}>{t.subject || "(no subject)"}</span>
              </div>
              {density === "comfortable" ? <p className="mt-0.5 line-clamp-1 text-ink-subtle">{t.snippet || " "}</p> : null}
            </div>
          )}
        </Link>
      </div>
      {layout === "line" ? quick : null}
    </li>
  );
});
