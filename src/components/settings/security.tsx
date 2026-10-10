"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Laptop, LogOut, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api, errorMessage } from "@/lib/client/api";
import { fullDate, relativeTime } from "@/lib/client/format";
import { Section } from "./section";

type SessionRow = { id: string; current: boolean; createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null };
type EventRow = { id: string; type: string; ip: string | null; userAgent: string | null; createdAt: string };

export function describeAgent(ua: string | null) {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /curl|node|undici/i.test(ua) ? "Script" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { label: os ? `${browser} on ${os}` : browser, mobile: /iPhone|Android|Mobile/.test(ua) };
}

const EVENT_LABELS: Record<string, string> = {
  register: "Account created",
  login: "Signed in",
  login_failed: "Failed sign-in attempt",
  logout: "Signed out",
  password_changed: "Password changed",
  password_reset_requested: "Password reset requested",
  password_reset: "Password reset",
  email_verified: "Recovery email confirmed",
  session_revoked: "Session signed out",
  sessions_revoked: "Other sessions signed out",
  profile_updated: "Profile updated",
  data_exported: "Data exported",
};

export function SecuritySettings({ prefs }: { prefs: { locale: string; timeZone: string } }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => api<{ sessions: SessionRow[] }>("/api/sessions") });
  const events = useQuery({ queryKey: ["security-events"], queryFn: () => api<{ events: EventRow[] }>("/api/security-events") });
  const others = (sessions.data?.sessions ?? []).filter((s) => !s.current);

  return (
    <>
      <Section title="Where you're signed in" description="Sign out of sessions you don't recognise, then change your password.">
        {sessions.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {sessions.data?.sessions.map((s) => {
              const agent = describeAgent(s.userAgent);
              const Icon = agent.mobile ? Smartphone : Laptop;
              return (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <Icon className="size-5 shrink-0 text-ink-subtle" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
                      {agent.label}
                      {s.current ? <Badge tone="ok">This device</Badge> : null}
                    </p>
                    <p className="text-xs text-ink-subtle">
                      {s.ip ?? "Unknown IP"} · Active {relativeTime(s.lastSeenAt, prefs)} · Signed in {fullDate(s.createdAt, prefs)}
                    </p>
                  </div>
                  {!s.current ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await api(`/api/sessions/${encodeURIComponent(s.id)}`, { method: "DELETE" });
                          toast("Session signed out");
                          void qc.invalidateQueries({ queryKey: ["sessions"] });
                          void qc.invalidateQueries({ queryKey: ["security-events"] });
                        } catch (err) {
                          toast.error(errorMessage(err));
                        }
                      }}
                    >
                      Sign out
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {others.length > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              if (!(await confirm({ title: "Sign out of all other sessions?", confirmLabel: "Sign out others" }))) return;
              try {
                const res = await api<{ revoked: number }>("/api/sessions", { method: "DELETE" });
                toast(`Signed out of ${res.revoked} session${res.revoked === 1 ? "" : "s"}`);
                void qc.invalidateQueries({ queryKey: ["sessions"] });
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <LogOut className="size-3.5" /> Sign out of all other sessions
          </Button>
        ) : null}
      </Section>
      <Section title="Recent security activity" description="Sign-ins and changes to your account.">
        {events.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : events.data?.events.length ? (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {events.data.events.slice(0, 20).map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2.5 text-[13px]">
                <span className={e.type === "login_failed" ? "text-danger" : "text-ink"}>{EVENT_LABELS[e.type] ?? e.type}</span>
                <span className="text-xs text-ink-subtle">
                  {describeAgent(e.userAgent).label} · {e.ip ?? "—"} · {fullDate(e.createdAt, prefs)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-subtle">No activity recorded yet.</p>
        )}
      </Section>
    </>
  );
}
