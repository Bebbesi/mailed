"use client";

import { Download, FileUp, Info, Server } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { uploadWithProgress, errorMessage } from "@/lib/client/api";
import { formatBytes } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import type { MeDTO } from "@/lib/types";
import { Row, Section } from "./section";

export function DataSettings({ me }: { me: MeDTO }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [folder, setFolder] = useState<"archive" | "inbox">("archive");
  const [progress, setProgress] = useState<number | null>(null);
  const used = me.storage.usedBytes;
  const quota = me.storage.quotaBytes;
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0;

  const upload = async (file: File) => {
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Files can be at most 100 MB. Split large mailboxes into several files.");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    setProgress(0);
    try {
      await uploadWithProgress("/api/import", form, setProgress);
      toast("Import started. You'll get a notification when it finishes.");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  return (
    <>
      <Section title="Storage" description="Messages and attachments count towards your storage.">
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Storage used" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn("h-full rounded-full", pct > 90 ? "bg-danger" : pct > 75 ? "bg-warn" : "bg-accent")} style={{ width: `${Math.max(pct, 0.5)}%` }} />
          </div>
          <p className="mt-2 text-[13px] text-ink-muted">
            {formatBytes(used)} of {formatBytes(quota)} used ({pct.toFixed(pct < 1 ? 2 : 0)}%)
          </p>
          <p className="mt-1 text-xs text-ink-subtle">Emptying Trash and Spam frees space immediately.</p>
        </div>
      </Section>
      <Section title="Export" description="Download a copy of your data at any time.">
        <Row label="Account data" description="Profile, settings, labels, contacts, filters and sender lists as JSON.">
          <Button asChild size="sm">
            <a href="/api/export/account" download>
              <Download className="size-3.5" /> Download JSON
            </a>
          </Button>
        </Row>
        <Row label="All messages" description="Every message with attachments, in the standard mbox format other mail apps can import.">
          <Button asChild size="sm">
            <a href="/api/export/mailbox" download>
              <Download className="size-3.5" /> Download mbox
            </a>
          </Button>
        </Row>
      </Section>
      <Section title="Import" description="Bring mail from another service. Export it as .mbox (for example with Google Takeout) or save single messages as .eml.">
        <Row htmlFor="import-folder" label="Put imported mail in">
          <Select id="import-folder" value={folder} onChange={(e) => setFolder(e.target.value as "archive" | "inbox")} className="w-40">
            <option value="archive">Archive</option>
            <option value="inbox">Inbox</option>
          </Select>
        </Row>
        <div>
          <input ref={fileRef} type="file" accept=".mbox,.eml,.mbx,message/rfc822,application/mbox" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={progress !== null}>
            <FileUp className="size-3.5" />
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Choose file…"}
          </Button>
          <p className="mt-2 text-xs text-ink-subtle">Up to 100 MB per file. Messages already in your mailbox are skipped. Messages you sent go to Sent.</p>
        </div>
      </Section>
      <Section title="Mail delivery" description="How this Mailed server exchanges mail with the rest of the internet.">
        <div className="space-y-3 text-[13px]">
          <p className="flex items-start gap-2 text-ink-muted">
            <Server className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
            <span>
              Domains hosted here: <span className="font-medium text-ink">{me.mail.domains.join(", ")}</span>
            </span>
          </p>
          <p className={cn("flex items-start gap-2", me.mail.outboundConfigured ? "text-ink-muted" : "text-warn")}>
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            {me.mail.outboundConfigured
              ? "Outgoing mail to other providers is enabled."
              : "Outgoing mail to other providers is not configured on this server. You can still exchange mail with other Mailed addresses."}
          </p>
        </div>
      </Section>
    </>
  );
}
