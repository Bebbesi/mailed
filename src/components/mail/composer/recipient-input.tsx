"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useContactSuggestions } from "@/lib/client/hooks";
import { cn } from "@/lib/cn";
import type { AddressDTO } from "@/lib/types";

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]+$/;

export function isValidAddress(a: string) {
  return EMAIL.test(a) && a.length <= 254;
}

/** Parses "Name <a@b.c>, d@e.f" into address objects. */
export function parseRecipients(text: string): AddressDTO[] {
  const out: AddressDTO[] = [];
  const re = /(?:"?([^"<>,;]*?)"?\s*<([^<>\s,;]+)>)|([^\s<>,;]+@[^\s<>,;]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m[2]) out.push({ name: m[1]?.trim() ?? "", address: m[2].trim().toLowerCase() });
    else if (m[3]) out.push({ name: "", address: m[3].trim().toLowerCase() });
  }
  if (out.length === 0 && text.trim()) out.push({ name: "", address: text.trim().toLowerCase() });
  return out;
}

export function RecipientInput({
  label,
  value,
  onChange,
  autoFocus,
  trailing,
}: {
  label: string;
  value: AddressDTO[];
  onChange: (v: AddressDTO[]) => void;
  autoFocus?: boolean;
  trailing?: React.ReactNode;
}) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(text.trim()), 120);
    return () => clearTimeout(t);
  }, [text]);

  const { data } = useContactSuggestions(debounced, open && debounced.length > 0);
  const taken = new Set(value.map((v) => v.address));
  const suggestions = (data?.suggestions ?? []).filter((s) => !taken.has(s.address)).slice(0, 6);
  const showList = open && debounced.length > 0 && suggestions.length > 0;
  const activeIndex = Math.min(active, Math.max(0, suggestions.length - 1));

  const commit = (items: AddressDTO[]) => {
    const merged = [...value];
    for (const item of items) {
      if (!item.address || merged.some((m) => m.address === item.address)) continue;
      merged.push(item);
    }
    onChange(merged);
    setText("");
    setOpen(false);
  };

  const commitText = () => {
    if (text.trim()) commit(parseRecipients(text));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showList && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setActive((e.key === "ArrowDown" ? activeIndex + 1 : activeIndex - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab" || e.key === "," || e.key === ";") {
      if (showList && (e.key === "Enter" || e.key === "Tab")) {
        e.preventDefault();
        const s = suggestions[activeIndex];
        commit([{ name: s.name, address: s.address }]);
        return;
      }
      if (text.trim()) {
        if (e.key !== "Tab") e.preventDefault();
        commitText();
      }
      return;
    }
    if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
      return;
    }
    if (e.key === "Escape" && showList) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  return (
    <div className="relative flex min-h-10 items-start gap-2 border-b border-line px-4 py-1.5" onClick={() => inputRef.current?.focus()}>
      <label htmlFor={id} className="w-10 shrink-0 pt-1.5 text-[13px] text-ink-subtle">
        {label}
      </label>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {value.map((r) => {
          const valid = isValidAddress(r.address);
          return (
            <span
              key={r.address}
              title={r.address}
              className={cn(
                "inline-flex h-6 max-w-full items-center gap-1 rounded-full border pr-1 pl-2 text-[12px]",
                valid ? "border-line-strong bg-hover text-ink" : "border-danger/40 bg-danger-soft text-danger",
              )}
            >
              <span className="truncate">{r.name || r.address}</span>
              <button
                type="button"
                aria-label={`Remove ${r.address}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((v) => v.address !== r.address));
                }}
                className="flex size-4 items-center justify-center rounded-full text-ink-subtle hover:bg-active hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={inputRef}
          id={id}
          value={text}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList ? `${listId}-${activeIndex}` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setTimeout(() => setOpen(false), 120);
            commitText();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (/[,;\n]/.test(pasted) || /@.*@/.test(pasted)) {
              e.preventDefault();
              commit(parseRecipients(pasted));
            }
          }}
          className="h-7 min-w-32 flex-1 bg-transparent text-[13px] text-ink focus:outline-none"
        />
      </div>
      {trailing}
      {showList ? (
        <ul id={listId} role="listbox" aria-label="Suggestions" className="absolute top-full left-14 z-30 mt-1 w-[min(360px,calc(100%-4rem))] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          {suggestions.map((s, i) => (
            <li
              key={s.address}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                commit([{ name: s.name, address: s.address }]);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-default items-center gap-3 px-3 py-1.5", i === activeIndex && "bg-hover")}
            >
              <Avatar name={s.name || s.address} email={s.address} size={26} />
              <span className="min-w-0">
                <span className="block truncate text-[13px] text-ink">{s.name || s.address}</span>
                {s.name ? <span className="block truncate text-xs text-ink-subtle">{s.address}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
