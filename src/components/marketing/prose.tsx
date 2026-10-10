import type { ReactNode } from "react";

export function ProsePage({ title, updated, intro, children }: { title: string; updated?: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
      {updated ? <p className="mt-2 text-[13px] text-ink-subtle">Last updated {updated}</p> : null}
      {intro ? <p className="mt-6 text-[15px] leading-relaxed text-ink-muted">{intro}</p> : null}
      <div className="mt-10 space-y-10 text-[14px] leading-relaxed text-ink-muted [&_a]:font-medium [&_a]:text-accent-ink [&_a:hover]:underline [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
