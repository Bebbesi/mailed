"use client";

import { CalendarDays, Check, ChevronDown, Paperclip, Star, User, X, MailQuestion } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

export type Filters = { unread: boolean; starred: boolean; attachment: boolean; from: string; within: "" | "7d" | "1m" | "1y" };

export const NO_FILTERS: Filters = { unread: false, starred: false, attachment: false, from: "", within: "" };

export function filtersToQuery(f: Filters): string {
  const parts: string[] = [];
  if (f.unread) parts.push("is:unread");
  if (f.starred) parts.push("is:starred");
  if (f.attachment) parts.push("has:attachment");
  if (f.from.trim()) parts.push(`from:${/\s/.test(f.from.trim()) ? `"${f.from.trim()}"` : f.from.trim()}`);
  if (f.within) parts.push(`newer_than:${f.within}`);
  return parts.join(" ");
}

function Chip({ active, onClick, children, ...rest }: { active: boolean; onClick?: () => void; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      {...rest}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors [&_svg]:size-3.5",
        active ? "border-accent/40 bg-accent-soft text-accent-ink" : "border-line-strong text-ink-muted hover:bg-hover hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

const WITHIN: Record<Filters["within"], string> = { "": "Any time", "7d": "Last 7 days", "1m": "Last 30 days", "1y": "Last year" };

export function FilterBar({ value, onChange }: { value: Filters; onChange: (f: Filters) => void }) {
  const [fromDraft, setFromDraft] = useState(value.from);
  const [fromOpen, setFromOpen] = useState(false);
  const active = filtersToQuery(value).length > 0;
  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-line px-3 py-2 scrollbar-thin" role="group" aria-label="Filters">
      <Chip active={value.unread} onClick={() => onChange({ ...value, unread: !value.unread })}>
        <MailQuestion />
        Unread
      </Chip>
      <Chip active={value.starred} onClick={() => onChange({ ...value, starred: !value.starred })}>
        <Star />
        Starred
      </Chip>
      <Chip active={value.attachment} onClick={() => onChange({ ...value, attachment: !value.attachment })}>
        <Paperclip />
        Attachments
      </Chip>
      <Popover
        open={fromOpen}
        onOpenChange={(o) => {
          setFromOpen(o);
          if (o) setFromDraft(value.from);
        }}
      >
        <PopoverTrigger asChild>
          <Chip active={Boolean(value.from)} aria-haspopup="dialog">
            <User />
            {value.from ? `From: ${value.from}` : "From"}
            <ChevronDown />
          </Chip>
        </PopoverTrigger>
        <PopoverContent className="w-72" aria-label="Filter by sender">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onChange({ ...value, from: fromDraft.trim() });
              setFromOpen(false);
            }}
            className="space-y-3"
          >
            <label htmlFor="filter-from" className="block text-[13px] font-medium">
              Sender name or address
            </label>
            <Input id="filter-from" value={fromDraft} onChange={(e) => setFromDraft(e.target.value)} autoFocus placeholder="e.g. giulia or example.com" />
            <div className="flex justify-end gap-2">
              {value.from ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onChange({ ...value, from: "" });
                    setFromOpen(false);
                  }}
                >
                  Clear
                </Button>
              ) : null}
              <Button type="submit" variant="primary" size="sm">
                Apply
              </Button>
            </div>
          </form>
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Chip active={Boolean(value.within)}>
            <CalendarDays />
            {WITHIN[value.within]}
            <ChevronDown />
          </Chip>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-44">
          {(Object.keys(WITHIN) as Filters["within"][]).map((k) => (
            <DropdownMenuItem key={k} onSelect={() => onChange({ ...value, within: k })}>
              <span className="flex w-full items-center justify-between">
                {WITHIN[k]}
                {value.within === k ? <Check className="size-3.5" /> : null}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {active ? (
        <button type="button" onClick={() => onChange(NO_FILTERS)} className="ml-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-ink-subtle hover:bg-hover hover:text-ink">
          <X className="size-3.5" />
          Clear filters
        </button>
      ) : null}
    </div>
  );
}
