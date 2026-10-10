import type { ReactNode } from "react";

export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <>
      <div className="rounded-xl border border-line bg-surface p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1.5 text-[13px] leading-relaxed text-ink-subtle">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <p className="mt-5 text-center text-[13px] text-ink-subtle">{footer}</p> : null}
    </>
  );
}

export function FormAlert({ tone = "danger", children }: { tone?: "danger" | "ok" | "info"; children: ReactNode }) {
  const styles = {
    danger: "border-danger/25 bg-danger-soft text-danger",
    ok: "border-ok/25 bg-ok-soft text-ok",
    info: "border-line bg-hover text-ink-muted",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`rounded-md border px-3 py-2.5 text-[13px] leading-relaxed ${styles}`}>
      {children}
    </div>
  );
}
