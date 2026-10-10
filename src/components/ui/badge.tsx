import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "neutral" | "accent" | "danger" | "warn" | "ok";

const tones: Record<Tone, string> = {
  neutral: "bg-hover text-ink-muted border-line",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  ok: "bg-ok-soft text-ok border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[11px] font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}
