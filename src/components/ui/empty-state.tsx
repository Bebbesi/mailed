import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}>
      <div className="mb-4 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-subtle shadow-xs [&_svg]:size-5">
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-subtle">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
