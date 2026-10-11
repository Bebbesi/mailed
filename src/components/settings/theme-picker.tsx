"use client";

import { Check } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { ThemePreview } from "@/components/ui/theme-swatch";
import { cn } from "@/lib/cn";
import { THEMES, type ThemePref } from "@/lib/themes";

const OPTIONS: { id: ThemePref; label: string }[] = [{ id: "system", label: "System" }, ...THEMES];

/** Radio group of live theme previews. Arrow keys move between options. */
export function ThemePicker({ value, onChange }: { value: ThemePref; onChange: (theme: ThemePref) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + OPTIONS.length) % OPTIONS.length;
    onChange(OPTIONS[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {OPTIONS.map((o, i) => {
        const selected = value === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "group rounded-lg border p-1.5 text-left transition-colors",
              selected ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong",
            )}
          >
            <div className="h-16 overflow-hidden rounded-md border border-line">
              {o.id === "system" ? (
                <div className="grid h-full grid-cols-2">
                  <ThemePreview id="light" />
                  <ThemePreview id="dark" />
                </div>
              ) : (
                <ThemePreview id={o.id} />
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
              <span className={cn("truncate text-[12px] font-medium", selected ? "text-ink" : "text-ink-muted")}>{o.label}</span>
              {selected ? <Check aria-hidden className="size-3.5 shrink-0 text-accent-ink" /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}
