import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Section({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-line py-8 first:pt-2 last:border-0", className)}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)] md:gap-10">
        <div>
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">{description}</p> : null}
        </div>
        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </section>
  );
}

export function Row({ label, description, htmlFor, children }: { label: string; description?: ReactNode; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink">
          {label}
        </label>
        {description ? <p id={htmlFor ? `${htmlFor}-desc` : undefined} className="mt-0.5 text-xs leading-relaxed text-ink-subtle">{description}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line-strong bg-hover p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded px-3 text-[12px] font-medium transition-colors [&_svg]:size-3.5",
            value === o.value ? "bg-surface text-ink shadow-xs" : "text-ink-subtle hover:text-ink",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
