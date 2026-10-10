"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/field";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/cn";

type Advanced = {
  from: string;
  to: string;
  subject: string;
  words: string;
  exclude: string;
  within: "" | "1d" | "7d" | "1m" | "1y";
  location: "" | "inbox" | "sent" | "drafts" | "archive" | "spam" | "trash" | "anywhere";
  attachment: boolean;
  unread: boolean;
};

const EMPTY: Advanced = { from: "", to: "", subject: "", words: "", exclude: "", within: "", location: "", attachment: false, unread: false };

const quote = (v: string) => (/\s/.test(v) ? `"${v.replace(/"/g, "")}"` : v);

export function buildQuery(a: Advanced): string {
  const parts: string[] = [];
  if (a.from.trim()) parts.push(`from:${quote(a.from.trim())}`);
  if (a.to.trim()) parts.push(`to:${quote(a.to.trim())}`);
  if (a.subject.trim()) parts.push(`subject:${quote(a.subject.trim())}`);
  if (a.words.trim()) parts.push(a.words.trim());
  for (const w of a.exclude.trim().split(/\s+/).filter(Boolean)) parts.push(`-${w}`);
  if (a.within) parts.push(`newer_than:${a.within}`);
  if (a.location) parts.push(`in:${a.location}`);
  if (a.attachment) parts.push("has:attachment");
  if (a.unread) parts.push("is:unread");
  return parts.join(" ");
}

export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const currentQ = pathname.startsWith("/app/search") ? (params.get("q") ?? "") : "";
  const [value, setValue] = useState(currentQ);
  const [syncedQ, setSyncedQ] = useState(currentQ);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [adv, setAdv] = useState<Advanced>(EMPTY);
  if (syncedQ !== currentQ) {
    setSyncedQ(currentQ);
    setValue(currentQ);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !t.isContentEditable && !["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (q: string) => {
    const query = q.trim();
    if (!query) return;
    router.push(`/app/search?q=${encodeURIComponent(query)}`);
    inputRef.current?.blur();
  };

  return (
    <Popover open={advancedOpen} onOpenChange={setAdvancedOpen}>
      <PopoverAnchor asChild>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            run(value);
          }}
          className={cn(
            "group flex h-9 min-w-0 items-center gap-2 rounded-lg border border-transparent bg-hover px-3 transition-colors focus-within:border-line-strong focus-within:bg-surface focus-within:shadow-xs",
            className,
          )}
        >
          <Search className="size-4 shrink-0 text-ink-subtle" aria-hidden />
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setValue(currentQ);
                inputRef.current?.blur();
              }
            }}
            placeholder="Search mail"
            aria-label="Search mail"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-subtle focus:outline-none"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setValue("");
                if (currentQ) router.push("/app/inbox");
                inputRef.current?.focus();
              }}
              className="flex size-6 items-center justify-center rounded text-ink-subtle hover:bg-active hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-line-strong px-1.5 font-mono text-[10px] text-ink-subtle group-focus-within:hidden md:inline">/</kbd>
          )}
          <button
            type="button"
            aria-label="Advanced search"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
            className="flex size-6 items-center justify-center rounded text-ink-subtle hover:bg-active hover:text-ink"
          >
            <SlidersHorizontal className="size-3.5" />
          </button>
        </form>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-[min(560px,calc(100vw-1rem))] p-5" aria-label="Advanced search">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = buildQuery(adv);
            if (!q) return;
            setValue(q);
            setAdvancedOpen(false);
            run(q);
          }}
          className="space-y-3"
        >
          {(
            [
              ["from", "From"],
              ["to", "To"],
              ["subject", "Subject"],
              ["words", "Has the words"],
              ["exclude", "Doesn't have"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="grid grid-cols-[110px_1fr] items-center gap-3">
              <Label htmlFor={`adv-${key}`} className="text-ink-subtle">
                {label}
              </Label>
              <Input id={`adv-${key}`} value={adv[key]} onChange={(e) => setAdv({ ...adv, [key]: e.target.value })} />
            </div>
          ))}
          <div className="grid grid-cols-[110px_1fr] items-center gap-3">
            <Label htmlFor="adv-within" className="text-ink-subtle">
              Date within
            </Label>
            <Select id="adv-within" value={adv.within} onChange={(e) => setAdv({ ...adv, within: e.target.value as Advanced["within"] })}>
              <option value="">Any time</option>
              <option value="1d">1 day</option>
              <option value="7d">1 week</option>
              <option value="1m">1 month</option>
              <option value="1y">1 year</option>
            </Select>
          </div>
          <div className="grid grid-cols-[110px_1fr] items-center gap-3">
            <Label htmlFor="adv-location" className="text-ink-subtle">
              Search in
            </Label>
            <Select id="adv-location" value={adv.location} onChange={(e) => setAdv({ ...adv, location: e.target.value as Advanced["location"] })}>
              <option value="">All mail</option>
              <option value="inbox">Inbox</option>
              <option value="sent">Sent</option>
              <option value="drafts">Drafts</option>
              <option value="archive">Archive</option>
              <option value="spam">Spam</option>
              <option value="trash">Trash</option>
              <option value="anywhere">Mail, Spam and Trash</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-5 pt-1 pl-0 sm:pl-[122px]">
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Checkbox checked={adv.attachment} onCheckedChange={(v) => setAdv({ ...adv, attachment: v })} />
              Has attachment
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-muted">
              <Checkbox checked={adv.unread} onCheckedChange={(v) => setAdv({ ...adv, unread: v })} />
              Unread only
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
            <p className="hidden text-xs text-ink-subtle sm:block">Tip: type operators like from: or has:attachment directly.</p>
            <div className="ml-auto flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAdv(EMPTY)}>
                Clear
              </Button>
              <Button type="submit" variant="primary" size="sm">
                Search
              </Button>
            </div>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
