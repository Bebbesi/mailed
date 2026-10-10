"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  BellPlus,
  ChevronDown,

  FileCode2,
  Forward,
  Mail,
  MoreVertical,
  Pencil,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  UserX,
} from "lucide-react";
import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip } from "@/components/ui/tooltip";
import { api, errorMessage } from "@/lib/client/api";
import { fullDate, listDate } from "@/lib/client/format";
import { useMailAction } from "@/lib/client/hooks";
import { cn } from "@/lib/cn";
import type { AddressDTO, MessageDTO } from "@/lib/types";
import { useApp } from "./app-context";
import { EmailFrame } from "./email-frame";
import { AttachmentList, AuthBadge, MessageBanners, RemoteContentNotice } from "./message-parts";
import { ReminderDialog } from "./reminder-dialog";

function linkify(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\bhttps?:\/\/[^\s<>"')\]]+/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <a key={m.index} href={m[0]} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-ink underline underline-offset-2">
        {m[0]}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function names(list: AddressDTO[], me: string) {
  return list.map((a) => (a.address === me ? "me" : a.name || a.address)).join(", ");
}

type Props = {
  m: MessageDTO;
  expanded: boolean;
  onToggle: () => void;
  onReply: (mode: "reply" | "reply_all" | "forward", messageId: string) => void;
  onEditDraft: (draftId: string) => void;
  isLast: boolean;
};

export const MessageItem = memo(function MessageItem({ m, expanded, onToggle, onReply, onEditDraft, isLast }: Props) {
  const { me, prefs, settings } = useApp();
  const qc = useQueryClient();
  const run = useMailAction();
  const confirm = useConfirm();
  const [remoteAllowed, setRemoteAllowed] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderKey, setReminderKey] = useState(0);
  const risky = m.folder === "spam" || m.isSuspicious || Boolean(m.security?.phishing);
  const showRemote = m.hasRemoteContent && (remoteAllowed || (settings.remoteImages === "always" && !risky));
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const isMeSender = m.direction === "outbound";

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["thread", m.threadId] });
    void qc.invalidateQueries({ queryKey: ["threads"] });
  };

  const onLinkClick = useCallback(
    async (href: string, e: MouseEvent) => {
      const flagged = m.security?.suspiciousLinks.find((l) => l.href === href);
      if (!risky && !flagged) return;
      e.preventDefault();
      let host = href;
      try {
        host = new URL(href).host;
      } catch {
        /* keep raw */
      }
      const ok = await confirm({
        title: "Open this link?",
        description: (
          <>
            It goes to <span className="font-medium break-all text-ink">{host}</span>.{" "}
            {flagged ? flagged.reasons.join(". ") + "." : "This message looks suspicious. Only continue if you trust the sender."}
          </>
        ),
        confirmLabel: "Open link",
        destructive: true,
      });
      if (ok) window.open(href, "_blank", "noopener,noreferrer");
    },
    [m.security, risky, confirm],
  );

  if (!expanded) {
    return (
      <li>
        <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-hover sm:px-6" aria-expanded={false}>
          <Avatar name={isMeSender ? `${me.firstName} ${me.lastName}` : m.from.name || m.from.address} email={m.from.address} size={28} src={isMeSender ? me.avatarUrl : null} />
          <span className={cn("w-36 shrink-0 truncate text-[13px] sm:w-44", !m.isRead ? "font-semibold text-ink" : "text-ink-muted")}>
            {m.isDraft ? <span className="text-danger">Draft</span> : isMeSender ? "me" : m.from.name || m.from.address}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-ink-subtle">{m.snippet}</span>
          <span className="shrink-0 text-[12px] text-ink-subtle">{listDate(m.date, prefs)}</span>
        </button>
      </li>
    );
  }

  if (m.isDraft) {
    return (
      <li className="px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Avatar name={`${me.firstName} ${me.lastName}`} email={me.address} src={me.avatarUrl} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-danger">Draft</p>
            <p className="truncate text-[12px] text-ink-subtle">{m.snippet || "Empty draft"}</p>
          </div>
          <button type="button" onClick={() => onEditDraft(m.id)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[13px] font-medium hover:bg-hover">
            <Pencil className="size-3.5" />
            Continue editing
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="px-4 pt-4 pb-5 sm:px-6">
      <div className="flex items-start gap-3">
        {isLast ? (
          <Avatar name={isMeSender ? `${me.firstName} ${me.lastName}` : m.from.name || m.from.address} email={m.from.address} size={36} src={isMeSender ? me.avatarUrl : null} />
        ) : (
          <button type="button" onClick={onToggle} aria-label="Collapse message" aria-expanded className="shrink-0 rounded-full">
            <Avatar name={isMeSender ? `${me.firstName} ${me.lastName}` : m.from.name || m.from.address} email={m.from.address} size={36} src={isMeSender ? me.avatarUrl : null} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13px] font-semibold text-ink">{isMeSender ? `${me.firstName} ${me.lastName}` : m.from.name || m.from.address}</span>
            {m.from.name || isMeSender ? <span className="truncate text-[12px] text-ink-subtle">&lt;{m.from.address}&gt;</span> : null}
            {m.security?.unknownSender && m.direction === "inbound" && m.folder !== "spam" ? (
              <Badge tone="neutral" className="h-4 text-[10px]">
                New sender
              </Badge>
            ) : null}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="mt-0.5 inline-flex max-w-full items-center gap-1 rounded text-left text-[12px] text-ink-subtle hover:text-ink">
                <span className="truncate">to {names([...m.to, ...m.cc], me.address) || "undisclosed recipients"}</span>
                <ChevronDown className="size-3.5 shrink-0" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(420px,calc(100vw-1rem))]" aria-label="Message details">
              <dl className="grid grid-cols-[72px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                <dt className="text-ink-subtle">From</dt>
                <dd className="break-all text-ink">{m.from.name ? `${m.from.name} <${m.from.address}>` : m.from.address}</dd>
                {m.replyTo ? (
                  <>
                    <dt className="text-ink-subtle">Reply-to</dt>
                    <dd className="break-all text-ink">{m.replyTo}</dd>
                  </>
                ) : null}
                <dt className="text-ink-subtle">To</dt>
                <dd className="break-all text-ink">{m.to.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ") || "—"}</dd>
                {m.cc.length ? (
                  <>
                    <dt className="text-ink-subtle">Cc</dt>
                    <dd className="break-all text-ink">{m.cc.map((a) => a.address).join(", ")}</dd>
                  </>
                ) : null}
                {m.bcc.length ? (
                  <>
                    <dt className="text-ink-subtle">Bcc</dt>
                    <dd className="break-all text-ink">{m.bcc.map((a) => a.address).join(", ")}</dd>
                  </>
                ) : null}
                <dt className="text-ink-subtle">Date</dt>
                <dd className="text-ink">{fullDate(m.date, prefs)}</dd>
                <dt className="text-ink-subtle">Subject</dt>
                <dd className="break-words text-ink">{m.subject || "(no subject)"}</dd>
                {m.direction === "inbound" && m.security ? (
                  <>
                    <dt className="text-ink-subtle">Security</dt>
                    <dd>
                      <AuthBadge auth={m.security.auth} />
                    </dd>
                  </>
                ) : null}
                {m.classification && m.direction === "inbound" ? (
                  <>
                    <dt className="text-ink-subtle">Category</dt>
                    <dd className="text-ink capitalize">
                      {m.classification.category}
                      {m.classification.categoryReasons[0] ? <span className="text-ink-subtle normal-case"> — {m.classification.categoryReasons[0]}</span> : null}
                    </dd>
                  </>
                ) : null}
              </dl>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip content={fullDate(m.date, prefs)}>
            <span className="mr-1 hidden text-[12px] text-ink-subtle sm:inline">{listDate(m.date, prefs)}</span>
          </Tooltip>
          <IconButton
            label={m.isStarred ? "Unstar" : "Star"}
            pressed={m.isStarred}
            icon={<Star className={cn(m.isStarred && "fill-[#e8a317] text-[#e8a317]")} />}
            onClick={() => void run({ messageIds: [m.id] }, { type: m.isStarred ? "unstar" : "star" }, { silent: true }).then(refresh)}
          />
          <IconButton label="Reply" icon={<Reply />} onClick={() => onReply("reply", m.id)} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="More" icon={<MoreVertical />} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem icon={<Reply />} onSelect={() => onReply("reply", m.id)}>
                Reply
              </DropdownMenuItem>
              <DropdownMenuItem icon={<ReplyAll />} onSelect={() => onReply("reply_all", m.id)}>
                Reply all
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Forward />} onSelect={() => onReply("forward", m.id)}>
                Forward
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                icon={<BellPlus />}
                onSelect={() => {
                  setReminderKey((k) => k + 1);
                  setReminderOpen(true);
                }}
              >
                Remind me…
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Mail />} onSelect={() => void run({ messageIds: [m.id] }, { type: "mark_unread" }, { silent: true }).then(refresh)}>
                Mark as unread
              </DropdownMenuItem>
              <DropdownMenuItem icon={<FileCode2 />} onSelect={() => window.open(`/api/messages/${m.id}/raw`, "_blank", "noopener")}>
                Download original (.eml)
              </DropdownMenuItem>
              {m.direction === "inbound" ? (
                <>
                  <DropdownMenuSeparator />
                  {m.folder === "spam" ? (
                    <DropdownMenuItem icon={<ShieldCheck />} onSelect={() => void run({ messageIds: [m.id] }, { type: "not_spam" }).then(refresh)}>
                      Not spam
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem icon={<ShieldAlert />} onSelect={() => void run({ messageIds: [m.id] }, { type: "spam" }).then(refresh)}>
                      Report spam
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    icon={<UserX />}
                    destructive
                    onSelect={async () => {
                      const ok = await confirm({
                        title: `Block ${m.from.address}?`,
                        description: "Future messages from this sender will go to Spam. You can unblock them in Settings.",
                        confirmLabel: "Block",
                        destructive: true,
                      });
                      if (ok) await run({ messageIds: [m.id] }, { type: "block_sender" }).then(refresh);
                    }}
                  >
                    Block sender
                  </DropdownMenuItem>
                </>
              ) : null}
              <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => void run({ messageIds: [m.id] }, { type: m.folder === "trash" ? "delete_forever" : "trash" }).then(refresh)}>
                {m.folder === "trash" ? "Delete forever" : "Delete this message"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 space-y-3 sm:pl-12">
        <MessageBanners
          m={m}
          prefs={prefs}
          onNotSpam={() => void run({ messageIds: [m.id] }, { type: "not_spam" }).then(refresh)}
          onReportSpam={() => void run({ messageIds: [m.id] }, { type: "spam" }).then(refresh)}
          onRetry={() =>
            void api(`/api/messages/${m.id}/retry`, { method: "POST", body: {} })
              .then(() => {
                toast("Sending again…");
                refresh();
              })
              .catch((e) => toast.error(errorMessage(e)))
          }
          onCancelSend={() =>
            void api(`/api/messages/${m.id}/cancel`, { method: "POST", body: {} })
              .then(() => {
                toast("Send cancelled. The message is back in Drafts.");
                refresh();
              })
              .catch((e) => toast.error(errorMessage(e)))
          }
          onRemoveReminder={() =>
            m.reminder &&
            void api(`/api/reminders/${m.reminder.id}`, { method: "DELETE" })
              .then(refresh)
              .catch((e) => toast.error(errorMessage(e)))
          }
        />
        {m.hasRemoteContent && !showRemote ? <RemoteContentNotice risky={risky} onAllow={() => setRemoteAllowed(true)} /> : null}
        <div className="min-w-0">
          {m.html ? (
            <EmailFrame html={m.html} allowRemote={showRemote} dark={dark} onLinkClick={onLinkClick} title={`Message from ${m.from.name || m.from.address}`} />
          ) : (
            <div className="text-[14px] leading-relaxed break-words whitespace-pre-wrap text-ink">{m.text ? linkify(m.text) : <span className="text-ink-subtle">(This message has no content.)</span>}</div>
          )}
        </div>
        <AttachmentList attachments={m.attachments} risky={risky} />
        {m.listUnsubscribe && m.folder !== "spam" ? <UnsubscribeHint value={m.listUnsubscribe} /> : null}
      </div>
      <ReminderDialog key={reminderKey} open={reminderOpen} onOpenChange={setReminderOpen} messageId={m.id} threadId={m.threadId} outbound={m.direction === "outbound"} />
      {isLast ? null : <span className="sr-only">End of message</span>}
    </li>
  );
});

function UnsubscribeHint({ value }: { value: string }) {
  const https = /<(https:[^>]+)>/.exec(value)?.[1];
  const mailto = /<(mailto:[^>]+)>/.exec(value)?.[1];
  const href = https ?? mailto;
  if (!href) return null;
  return (
    <p className="pt-2 text-[12px] text-ink-subtle">
      This is a mailing list.{" "}
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-medium text-accent-ink hover:underline">
        Unsubscribe
      </a>
    </p>
  );
}

