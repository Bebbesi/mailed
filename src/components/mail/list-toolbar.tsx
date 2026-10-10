"use client";

import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Inbox,
  Mail,
  MailOpen,
  MoreVertical,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  StarOff,
  Trash2,
  X,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import type { ThreadSummary, ViewRef } from "@/lib/types";
import { CategoryMenu, LabelMenu, SnoozeMenu } from "./menus";
import type { MailAction } from "@/lib/client/hooks";

export type SelectMode = "all" | "none" | "read" | "unread" | "starred" | "unstarred";

export function viewCapabilities(view: ViewRef) {
  const v = view.kind === "system" ? view.view : null;
  return {
    archive: !v || ["inbox", "starred", "important", "snoozed", "social", "promotions", "updates", "forums", "ads", "all"].includes(v),
    restore: v === "archive" || v === "trash",
    spam: v !== "spam" && v !== "drafts" && v !== "sent" && v !== "scheduled",
    notSpam: v === "spam",
    deleteForever: v === "trash" || v === "spam",
    snooze: !v || ["inbox", "starred", "important", "social", "promotions", "updates", "forums", "ads", "archive", "all"].includes(v),
    unsnooze: v === "snoozed",
    category: v !== "sent" && v !== "drafts" && v !== "scheduled",
  };
}

export function ListToolbar({
  view,
  threads,
  selected,
  onSelect,
  onClear,
  onAction,
  onRefresh,
  refreshing,
  range,
}: {
  view: ViewRef;
  threads: ThreadSummary[];
  selected: string[];
  onSelect: (mode: SelectMode) => void;
  onClear: () => void;
  onAction: (action: MailAction) => void;
  onRefresh: () => void;
  refreshing: boolean;
  range: string;
}) {
  const caps = viewCapabilities(view);
  const sel = threads.filter((t) => selected.includes(t.id));
  const allChecked = threads.length > 0 && selected.length === threads.length;
  const someChecked = selected.length > 0 && !allChecked;
  const anyUnread = sel.some((t) => t.unread);
  const anyStarred = sel.some((t) => t.starred);

  const labelState: Record<string, "all" | "some"> = {};
  for (const t of sel) for (const l of t.labels) labelState[l.id] = "some";
  for (const id of Object.keys(labelState)) if (sel.every((t) => t.labels.some((l) => l.id === id))) labelState[id] = "all";

  return (
    <div role="toolbar" aria-label="Conversation actions" className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-2 [scrollbar-width:none]">
      <div className="flex items-center">
        <span className="flex size-8 items-center justify-center">
          <Checkbox
            checked={allChecked ? true : someChecked ? "indeterminate" : false}
            onCheckedChange={(v) => (v ? onSelect("all") : onClear())}
            aria-label={allChecked ? "Deselect all" : "Select all"}
          />
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Selection options" className="flex h-8 w-5 items-center justify-center rounded text-ink-subtle hover:bg-hover hover:text-ink">
              <ChevronDown className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            {(["all", "none", "read", "unread", "starred", "unstarred"] as SelectMode[]).map((m) => (
              <DropdownMenuItem key={m} onSelect={() => onSelect(m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {selected.length === 0 ? (
        <>
          <IconButton label="Refresh" icon={refreshing ? <Spinner /> : <RefreshCw />} onClick={onRefresh} disabled={refreshing} />
          <span className="ml-auto pr-2 text-xs text-ink-subtle tabular-nums">{range}</span>
        </>
      ) : (
        <>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {caps.archive ? <IconButton label="Archive" shortcut="E" icon={<Archive />} onClick={() => onAction({ type: "archive" })} /> : null}
          {caps.restore ? (
            <IconButton label={view.kind === "system" && view.view === "trash" ? "Restore" : "Move to Inbox"} icon={view.kind === "system" && view.view === "trash" ? <ArchiveRestore /> : <Inbox />} onClick={() => onAction({ type: "move_to_inbox" })} />
          ) : null}
          {caps.spam ? <IconButton label="Report spam" shortcut="!" icon={<ShieldAlert />} onClick={() => onAction({ type: "spam" })} /> : null}
          {caps.notSpam ? <IconButton label="Not spam" icon={<ShieldCheck />} onClick={() => onAction({ type: "not_spam" })} /> : null}
          {caps.deleteForever ? (
            <IconButton label="Delete forever" icon={<Trash2 />} onClick={() => onAction({ type: "delete_forever" })} />
          ) : (
            <IconButton label="Delete" shortcut="#" icon={<Trash2 />} onClick={() => onAction({ type: "trash" })} />
          )}
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          {anyUnread ? (
            <IconButton label="Mark as read" icon={<MailOpen />} onClick={() => onAction({ type: "mark_read" })} />
          ) : (
            <IconButton label="Mark as unread" icon={<Mail />} onClick={() => onAction({ type: "mark_unread" })} />
          )}
          {caps.snooze ? <SnoozeMenu onSnooze={(d) => onAction({ type: "snooze", until: d.toISOString() })} /> : null}
          {caps.unsnooze ? <IconButton label="Unsnooze" icon={<Inbox />} onClick={() => onAction({ type: "unsnooze" })} /> : null}
          <LabelMenu state={labelState} onToggle={(labelId, add) => onAction(add ? { type: "add_label", labelId } : { type: "remove_label", labelId })} />
          {caps.category ? <CategoryMenu onSelect={(category) => onAction({ type: "set_category", category })} /> : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="More actions" icon={<MoreVertical />} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {anyUnread ? (
                <DropdownMenuItem icon={<Mail />} onSelect={() => onAction({ type: "mark_unread" })}>
                  Mark as unread
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem icon={<MailOpen />} onSelect={() => onAction({ type: "mark_read" })}>
                  Mark as read
                </DropdownMenuItem>
              )}
              <DropdownMenuItem icon={<Star />} onSelect={() => onAction({ type: "star" })}>
                Add star
              </DropdownMenuItem>
              {anyStarred ? (
                <DropdownMenuItem icon={<StarOff />} onSelect={() => onAction({ type: "unstar" })}>
                  Remove star
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem icon={<ShieldAlert />} onSelect={() => onAction({ type: "block_sender" })} destructive>
                Block sender
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ml-auto flex items-center gap-1 pr-1 text-xs text-ink-subtle">
            {selected.length} selected
            <IconButton label="Clear selection" icon={<X />} onClick={onClear} />
          </span>
        </>
      )}
    </div>
  );
}
