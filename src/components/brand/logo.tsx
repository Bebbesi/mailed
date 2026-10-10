import { cn } from "@/lib/cn";

/** Mailed mark: an "M" whose centre dips like an envelope flap. */
export function LogoMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <rect x="1" y="1" width="22" height="22" rx="6" className="fill-ink" />
      <path
        d="M6.75 16.25V8.4l5.25 4.35 5.25-4.35v7.85"
        fill="none"
        className="stroke-canvas"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className={markClassName} />
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">Mailed</span>
    </span>
  );
}
