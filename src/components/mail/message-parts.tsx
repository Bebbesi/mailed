"use client";

import {
  AlertOctagon,
  AlertTriangle,
  BellRing,
  CalendarClock,
  Download,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { formatBytes, fullDate } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { AttachmentDTO, MessageDTO } from "@/lib/types";

export function Banner({
  tone,
  icon,
  title,
  children,
  actions,
}: {
  tone: "danger" | "warn" | "info" | "accent";
  icon: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const styles = {
    danger: "border-danger/25 bg-danger-soft text-danger",
    warn: "border-warn/25 bg-warn-soft text-warn",
    info: "border-line bg-hover text-ink-muted",
    accent: "border-accent/20 bg-accent-soft text-accent-ink",
  }[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-3.5 py-3 text-[13px]", styles)}>
      <span className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {children ? <div className="mt-1 text-[12px] leading-relaxed opacity-90">{children}</div> : null}
        {actions ? <div className="mt-2.5 flex flex-wrap gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

/** Warnings about phishing, spam, spoofing and delivery status for one message. */
export function MessageBanners({
  m,
  prefs,
  onNotSpam,
  onReportSpam,
  onRetry,
  onCancelSend,
  onRemoveReminder,
}: {
  m: MessageDTO;
  prefs: { locale: string; timeZone: string };
  onNotSpam: () => void;
  onReportSpam: () => void;
  onRetry: () => void;
  onCancelSend: () => void;
  onRemoveReminder: () => void;
}) {
  const s = m.security;
  const items: React.ReactNode[] = [];

  if (m.direction === "outbound") {
    if (m.sendStatus === "scheduled" && m.scheduledAt) {
      items.push(
        <Banner key="sched" tone="accent" icon={<CalendarClock />} title={`Scheduled for ${fullDate(m.scheduledAt, prefs)}`} actions={<Button size="xs" variant="secondary" onClick={onCancelSend}>Cancel send</Button>} />,
      );
    } else if (m.sendStatus === "queued" || m.sendStatus === "sending") {
      items.push(
        <Banner key="sending" tone="info" icon={<Loader2 className="animate-spin" />} title="Sending…">
          {m.sendError ?? null}
        </Banner>,
      );
    } else if (m.sendStatus === "failed") {
      items.push(
        <Banner key="failed" tone="danger" icon={<AlertOctagon />} title="This message was not delivered" actions={<Button size="xs" variant="secondary" onClick={onRetry}>Try again</Button>}>
          {m.sendError}
        </Banner>,
      );
    } else if (m.sendStatus === "bounced") {
      items.push(
        <Banner key="bounced" tone="danger" icon={<AlertOctagon />} title="The recipient's server rejected this message">
          {m.sendError}
        </Banner>,
      );
    } else if (m.sendStatus === "sent" && m.sendError) {
      items.push(
        <Banner key="partial" tone="warn" icon={<AlertTriangle />} title="Some recipients did not receive this message">
          {m.sendError}
        </Banner>,
      );
    }
  }

  if (s?.phishing) {
    items.push(
      <Banner
        key="phish"
        tone="danger"
        icon={<ShieldAlert />}
        title="This message might be a phishing attempt"
        actions={
          m.folder !== "spam" ? (
            <Button size="xs" variant="danger" onClick={onReportSpam}>
              Report spam
            </Button>
          ) : (
            <Button size="xs" variant="secondary" onClick={onNotSpam}>
              It&apos;s safe
            </Button>
          )
        }
      >
        <ul className="list-disc space-y-0.5 pl-4">
          {s.phishingReasons.slice(0, 4).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p className="mt-1.5">Don&apos;t reply with personal information, open attachments or follow links unless you trust the sender.</p>
      </Banner>,
    );
  } else if (m.folder === "spam") {
    const reasons = (m.classification?.spamReasons ?? []).filter((r) => r.weight > 0).slice(0, 4);
    items.push(
      <Banner
        key="spam"
        tone="warn"
        icon={<ShieldAlert />}
        title={`Why is this message in Spam?${m.classification ? ` (${Math.round(m.classification.spamProbability * 100)}% spam score)` : ""}`}
        actions={<Button size="xs" variant="secondary" onClick={onNotSpam}>Not spam</Button>}
      >
        {reasons.length ? (
          <ul className="list-disc space-y-0.5 pl-4">
            {reasons.map((r) => (
              <li key={r.code}>{r.label}</li>
            ))}
          </ul>
        ) : (
          "You or one of your filters marked this message as spam."
        )}
      </Banner>,
    );
  } else if (s && (s.spoofedDisplayName || s.replyToMismatch)) {
    items.push(
      <Banner key="spoof" tone="warn" icon={<AlertTriangle />} title="Check the sender before replying">
        {s.spoofedDisplayName ? "The name shown includes a different email address than the one that actually sent this message. " : ""}
        {s.replyToMismatch ? `Replies will go to ${m.replyTo}, not to ${m.from.address}.` : ""}
      </Banner>,
    );
  }

  if (s && !s.phishing && s.suspiciousLinks.length > 0 && m.folder !== "spam") {
    items.push(
      <Banner key="links" tone="warn" icon={<AlertTriangle />} title="Be careful with links in this message">
        <ul className="list-disc space-y-0.5 pl-4">
          {s.suspiciousLinks.slice(0, 3).map((l) => (
            <li key={l.href}>{l.reasons[0]}</li>
          ))}
        </ul>
      </Banner>,
    );
  }

  if (s && s.dangerousAttachments.length > 0) {
    items.push(
      <Banner key="att" tone="danger" icon={<ShieldAlert />} title="Attachments blocked for your safety">
        {s.dangerousAttachments.join(", ")} can run code on your device and can&apos;t be downloaded.
      </Banner>,
    );
  }

  if (m.reminder) {
    items.push(
      <Banner
        key="rem"
        tone="info"
        icon={<BellRing />}
        title={`Reminder ${m.reminder.onlyIfNoReply ? "(if no reply) " : ""}on ${fullDate(m.reminder.remindAt, prefs)}`}
        actions={<Button size="xs" variant="ghost" onClick={onRemoveReminder}>Remove reminder</Button>}
      />,
    );
  }

  if (items.length === 0) return null;
  return <div className="space-y-2">{items}</div>;
}

export function RemoteContentNotice({ onAllow, risky }: { onAllow: () => void; risky: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-line bg-hover px-3 py-2 text-[12px] text-ink-muted">
      <ImageIcon className="size-3.5 text-ink-subtle" aria-hidden />
      <span className="flex-1">{risky ? "Images are blocked in suspicious messages." : "Images in this message are hidden to protect your privacy."}</span>
      <button type="button" onClick={onAllow} className="font-medium text-accent-ink hover:underline">
        {risky ? "Show anyway" : "Show images"}
      </button>
    </div>
  );
}

function fileIcon(type: string, name: string) {
  if (type.startsWith("image/")) return FileImage;
  if (/pdf|text|word|document/.test(type)) return FileText;
  if (/sheet|excel|csv/.test(type) || /\.(xlsx?|csv)$/i.test(name)) return FileSpreadsheet;
  if (/zip|compressed|tar|rar|7z/.test(type)) return FileArchive;
  return File;
}

export function AttachmentList({ attachments, risky }: { attachments: AttachmentDTO[]; risky: boolean }) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const visible = attachments.filter((a) => !a.isInline);
  if (visible.length === 0) return null;

  const download = async (a: AttachmentDTO) => {
    let allowRisky = false;
    if (risky) {
      allowRisky = await confirm({
        title: `Download "${a.filename}"?`,
        description: "This attachment comes from a message that looks suspicious. Only open it if you trust the sender.",
        confirmLabel: "Download",
        destructive: true,
      });
      if (!allowRisky) return;
    }
    setBusy(a.id);
    try {
      const { url } = await api<{ url: string }>(`/api/attachments/${a.id}?format=json${allowRisky ? "&confirm=1" : ""}`);
      const link = document.createElement("a");
      link.href = url;
      link.rel = "noopener";
      link.download = a.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      if (err instanceof ApiError && err.code === "confirmation_required") {
        toast.error(err.message);
      } else toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5">
      <p className="mb-2 text-[12px] font-medium text-ink-subtle">
        {visible.length} attachment{visible.length === 1 ? "" : "s"}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((a) => {
          const Icon = fileIcon(a.contentType, a.filename);
          return (
            <li key={a.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", a.isDangerous ? "border-danger/30 bg-danger-soft" : "border-line bg-surface")}>
              <Icon className={cn("size-5 shrink-0", a.isDangerous ? "text-danger" : "text-ink-subtle")} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink" title={a.filename}>
                  {a.filename}
                </p>
                <p className="text-[11px] text-ink-subtle">{a.isDangerous ? "Blocked" : formatBytes(a.size)}</p>
              </div>
              {a.isDangerous ? (
                <Tooltip content="Blocked: this type of file can contain harmful software">
                  <span className="flex size-8 items-center justify-center text-danger" aria-label="Download blocked">
                    <X className="size-4" />
                  </span>
                </Tooltip>
              ) : (
                <Tooltip content={`Download ${a.filename}`}>
                  <button
                    type="button"
                    aria-label={`Download ${a.filename}`}
                    onClick={() => void download(a)}
                    disabled={busy === a.id}
                    className="flex size-8 items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink disabled:opacity-50"
                  >
                    {busy === a.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  </button>
                </Tooltip>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AuthBadge({ auth }: { auth: { spf?: string; dkim?: string; dmarc?: string } }) {
  const passed = auth.dmarc === "pass" || (auth.dkim === "pass" && auth.spf === "pass");
  const failed = auth.dmarc === "fail" || auth.spf === "fail" || auth.dkim === "fail";
  if (!auth.spf && !auth.dkim && !auth.dmarc) {
    return (
      <span className="inline-flex items-center gap-1 text-ink-subtle">
        <Info className="size-3.5" /> Not checked
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1", passed ? "text-ok" : failed ? "text-danger" : "text-ink-subtle")}>
      {passed ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
      SPF {auth.spf ?? "none"} · DKIM {auth.dkim ?? "none"} · DMARC {auth.dmarc ?? "none"}
    </span>
  );
}
