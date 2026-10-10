"use client";

import { Check, Clock, FolderInput, Plus, Search, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLabels } from "@/lib/client/hooks";
import { LABEL_DOT, VIEW_META } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import { CATEGORIES, type CategoryName } from "@/lib/types";
import { useApp } from "./app-context";
import { DateTimeDialog } from "./composer/schedule-menu";

function laterToday() {
  const d = new Date();
  d.setHours(d.getHours() < 17 ? 18 : d.getHours() + 3, 0, 0, 0);
  return d;
}
function daysAt(days: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function weekendAt(hour: number) {
  const d = new Date();
  const add = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + add);
  d.setHours(hour, 0, 0, 0);
  return d;
}
function nextWeekAt(hour: number) {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function snoozePresets() {
  const presets = [
    { label: "Later today", date: laterToday() },
    { label: "Tomorrow", date: daysAt(1, 8) },
    { label: "This weekend", date: weekendAt(8) },
    { label: "Next week", date: nextWeekAt(8) },
  ];
  const sameDay = presets[0].date.toDateString() === new Date().toDateString();
  return sameDay ? presets : presets.slice(1);
}

export function SnoozeMenu({
  onSnooze,
  open,
  onOpenChange,
  trigger,
}: {
  onSnooze: (d: Date) => void;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  trigger?: React.ReactNode;
}) {
  const { prefs } = useApp();
  const [custom, setCustom] = useState(false);
  const fmt = (d: Date) => {
    try {
      return new Intl.DateTimeFormat(prefs.locale, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };
  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>{trigger ?? <IconButton label="Snooze" shortcut="B" icon={<Clock />} />}</DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Snooze until…</DropdownMenuLabel>
          {snoozePresets().map((p) => (
            <DropdownMenuItem key={p.label} onSelect={() => onSnooze(p.date)}>
              <span className="flex w-full justify-between gap-3">
                <span>{p.label}</span>
                <span className="text-ink-subtle">{fmt(p.date)}</span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem icon={<Clock />} onSelect={() => setCustom(true)}>
            Pick date and time…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DateTimeDialog open={custom} onOpenChange={setCustom} title="Snooze until" confirmLabel="Snooze" onConfirm={onSnooze} />
    </>
  );
}

export function CategoryMenu({ onSelect, current }: { onSelect: (c: CategoryName) => void; current?: CategoryName }) {
  const names: Record<CategoryName, string> = { primary: "Primary", social: "Social", promotions: "Promotions", updates: "Updates", forums: "Forums", ads: "Ads" };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton label="Move to category" icon={<FolderInput />} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>Move to category</DropdownMenuLabel>
        {CATEGORIES.map((c) => {
          const Icon = c === "primary" ? VIEW_META.inbox.icon : VIEW_META[c].icon;
          return (
            <DropdownMenuItem key={c} icon={<Icon />} onSelect={() => onSelect(c)}>
              <span className="flex w-full items-center justify-between">
                {names[c]}
                {current === c ? <Check className="size-3.5" /> : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Applies or removes labels. `state` gives each label's presence across the
 * selection: all, some (indeterminate) or none.
 */
export function LabelMenu({
  state,
  onToggle,
}: {
  state: Record<string, "all" | "some">;
  onToggle: (labelId: string, add: boolean) => void;
}) {
  const { labels: initial, openLabelDialog } = useApp();
  const { data: labels = initial } = useLabels(initial);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => labels.filter((l) => l.name.toLowerCase().includes(q.trim().toLowerCase())), [labels, q]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <IconButton label="Labels" icon={<Tag />} />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" aria-label="Labels">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-3.5 text-ink-subtle" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a label"
            aria-label="Find a label"
            autoFocus
            className="h-9 flex-1 bg-transparent text-[13px] focus:outline-none"
          />
        </div>
        <ul className="max-h-64 overflow-y-auto py-1 scrollbar-thin" role="group" aria-label="Labels">
          {filtered.length === 0 ? <li className="px-3 py-3 text-[13px] text-ink-subtle">{labels.length ? "No matching labels" : "No labels yet"}</li> : null}
          {filtered.map((l) => {
            const s = state[l.id];
            return (
              <li key={l.id}>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={s === "all" ? true : s === "some" ? "mixed" : false}
                  onClick={() => onToggle(l.id, s !== "all")}
                  className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] hover:bg-hover"
                >
                  <span
                    className={cn(
                      "flex size-4 items-center justify-center rounded-[4px] border",
                      s === "all" ? "border-accent bg-accent text-white" : s === "some" ? "border-accent bg-accent/30" : "border-line-strong",
                    )}
                    aria-hidden
                  >
                    {s === "all" ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className={cn("size-2 rounded-full", LABEL_DOT[l.color])} aria-hidden />
                  <span className="truncate">{l.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-1">
          <button type="button" onClick={() => openLabelDialog()} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-[13px] text-ink-muted hover:bg-hover hover:text-ink">
            <Plus className="size-4" />
            Create label
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
