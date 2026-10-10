"use client";

import {
  AlertCircle,
  Archive,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Forward,
  Inbox,
  Mail,
  MoreVertical,
  Printer,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
  X,
  BellRing,
  BellOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/client/api";
import { fullDate } from "@/lib/client/format";
import { useMailAction, useThread, type MailAction } from "@/lib/client/hooks";
import { LABEL_CHIP, VIEW_META } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import type { ViewRef } from "@/lib/types";
import { useApp } from "./app-context";
import { Composer } from "./composer/composer";
import { viewCapabilities } from "./list-toolbar";
import { CategoryMenu, LabelMenu, SnoozeMenu } from "./menus";
import { MessageItem } from "./message-item";

type ReplyState = { mode: "reply" | "reply_all" | "forward"; sourceMessageId: string } | { draftId: string } | null;

export function ThreadView({
  threadId,
  view,
  onBack,
  onNavigate,
  position,
  showBack,
  snoozeOpen,
  onSnoozeOpenChange,
  replyRequest,
}: {
  threadId: string;
  view: ViewRef;
  onBack: () => void;
  onNavigate: (dir: -1 | 1) => void;
  position: { index: number; total: number } | null;
  showBack: boolean;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (v: boolean) => void;
  replyRequest: { mode: "reply" | "reply_all" | "forward"; nonce: number } | null;
}) {
  const { prefs, settings } = useApp();
  const { data, isLoading, error, refetch } = useThread(threadId, view);
  const run = useMailAction();
  const confirm = useConfirm();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedInit, setExpandedInit] = useState(false);
  const [reply, setReply] = useState<ReplyState>(null);
  const [handledNonce, setHandledNonce] = useState<number | null>(replyRequest?.nonce ?? null);
  const markedRead = useRef<string | null>(null);
  const replyRef = useRef<HTMLDivElement>(null);
  const caps = viewCapabilities(view);

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const sent = messages.filter((m) => !m.isDraft);
  const last = sent[sent.length - 1] ?? messages[messages.length - 1];

  // Expand the newest message and anything unread when the conversation first loads.
  if (data && !expandedInit) {
    setExpandedInit(true);
    const set = new Set<string>();
    for (const m of data.messages) if (!m.isRead || m.isDraft) set.add(m.id);
    if (last) set.add(last.id);
    setExpanded(set);
  }

  // Keyboard reply shortcuts from the list (r / a / f).
  if (replyRequest && replyRequest.nonce !== handledNonce && last) {
    setHandledNonce(replyRequest.nonce);
    setReply({ mode: replyRequest.mode, sourceMessageId: last.id });
  }

  useEffect(() => {
    if (!data || markedRead.current === threadId) return;
    markedRead.current = threadId;
    if (settings.markReadOnOpen && data.messages.some((m) => !m.isRead)) {
      void run({ threadIds: [threadId] }, { type: "mark_read" }, { silent: true }).catch(() => undefined);
    }
  }, [data, threadId, settings.markReadOnOpen, run]);

  useEffect(() => {
    if (reply) setTimeout(() => replyRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [reply]);

  const act = async (action: MailAction, leave = true) => {
    try {
      await run({ threadIds: [threadId] }, action);
      if (leave) onBack();
      else void refetch();
    } catch {
      /* toast already shown */
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-6" aria-busy="true" aria-label="Loading conversation">
        <Skeleton className="h-6 w-2/3" />
        <div className="flex gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<AlertCircle />}
        title="This conversation couldn't be loaded"
        description={errorMessage(error)}
        action={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
            <Button size="sm" variant="ghost" onClick={onBack}>
              Back to list
            </Button>
          </div>
        }
      />
    );
  }

  const inbound = messages.filter((m) => m.direction === "inbound");
  const category = inbound[inbound.length - 1]?.category;
  const labelState: Record<string, "all" | "some"> = {};
  for (const l of data.labels) labelState[l.id] = "all";
  const isTrash = view.kind === "system" && view.view === "trash";
  const isSpam = view.kind === "system" && view.view === "spam";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="toolbar" aria-label="Conversation actions" className="flex h-11 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-line px-2 [scrollbar-width:none]">
        {showBack ? <IconButton label="Back to list" shortcut="U" icon={<ArrowLeft />} onClick={onBack} /> : <IconButton label="Close" icon={<X />} onClick={onBack} />}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        {caps.archive && messages.some((m) => m.folder === "inbox") ? <IconButton label="Archive" shortcut="E" icon={<Archive />} onClick={() => void act({ type: "archive" })} /> : null}
        {messages.some((m) => m.folder === "archive" || m.folder === "trash") && !isSpam ? (
          <IconButton label="Move to Inbox" icon={<Inbox />} onClick={() => void act({ type: "move_to_inbox" })} />
        ) : null}
        {isSpam ? (
          <IconButton label="Not spam" icon={<ShieldCheck />} onClick={() => void act({ type: "not_spam" })} />
        ) : inbound.length > 0 && !isTrash ? (
          <IconButton label="Report spam" shortcut="!" icon={<ShieldAlert />} onClick={() => void act({ type: "spam" })} />
        ) : null}
        {isTrash || isSpam ? (
          <IconButton
            label="Delete forever"
            icon={<Trash2 />}
            onClick={async () => {
              const ok = await confirm({ title: "Delete this conversation forever?", description: "This can't be undone.", confirmLabel: "Delete forever", destructive: true });
              if (ok) await act({ type: "delete_forever" });
            }}
          />
        ) : (
          <IconButton label="Delete" shortcut="#" icon={<Trash2 />} onClick={() => void act({ type: "trash" })} />
        )}
        <span className="mx-1 h-5 w-px bg-line" aria-hidden />
        <IconButton label="Mark as unread" icon={<Mail />} onClick={() => void act({ type: "mark_unread" })} />
        {inbound.length > 0 && !isTrash && !isSpam ? (
          <SnoozeMenu open={snoozeOpen} onOpenChange={onSnoozeOpenChange} onSnooze={(d) => void act({ type: "snooze", until: d.toISOString() })} />
        ) : null}
        {messages.some((m) => m.snoozedUntil) ? <IconButton label="Unsnooze" icon={<BellOff />} onClick={() => void act({ type: "unsnooze" }, false)} /> : null}
        <LabelMenu state={labelState} onToggle={(labelId, add) => void act(add ? { type: "add_label", labelId } : { type: "remove_label", labelId }, false)} />
        {inbound.length > 0 && !isSpam ? <CategoryMenu current={category} onSelect={(c) => void act({ type: "set_category", category: c }, false)} /> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="More actions" icon={<MoreVertical />} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem icon={<BellRing />} onSelect={() => void act({ type: messages.some((m) => m.isImportant) ? "not_important" : "important" }, false)}>
              {messages.some((m) => m.isImportant) ? "Mark as not important" : "Mark as important"}
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Printer />} onSelect={() => window.print()}>
              Print
            </DropdownMenuItem>
            {inbound.length > 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  icon={<UserX />}
                  destructive
                  onSelect={async () => {
                    const ok = await confirm({
                      title: "Block this sender?",
                      description: "Messages from this sender will go to Spam. You can unblock them in Settings → Filters & senders.",
                      confirmLabel: "Block sender",
                      destructive: true,
                    });
                    if (ok) await act({ type: "block_sender" });
                  }}
                >
                  Block sender
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex items-center gap-0.5">
          {position ? (
            <span className="mr-1 hidden text-xs text-ink-subtle tabular-nums sm:inline">
              {position.index + 1} of {position.total}
            </span>
          ) : null}
          <IconButton label="Newer conversation" shortcut="K" icon={<ChevronLeft />} disabled={!position || position.index <= 0} onClick={() => onNavigate(-1)} />
          <IconButton label="Older conversation" shortcut="J" icon={<ChevronRight />} disabled={!position || position.index >= position.total - 1} onClick={() => onNavigate(1)} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin" id="thread-scroll">
        <header className="px-4 pt-5 pb-2 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight break-words text-ink">{data.subject || "(no subject)"}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {category && category !== "primary" && !isSpam ? (
              <span className="inline-flex h-5 items-center rounded border border-line px-1.5 text-[11px] text-ink-subtle">{VIEW_META[category].label}</span>
            ) : null}
            {data.labels.map((l) => (
              <span key={l.id} className={cn("inline-flex h-5 items-center gap-1 rounded pr-0.5 pl-1.5 text-[11px] font-medium", LABEL_CHIP[l.color] ?? LABEL_CHIP.slate)}>
                {l.name}
                <button type="button" aria-label={`Remove label ${l.name}`} onClick={() => void act({ type: "remove_label", labelId: l.id }, false)} className="flex size-4 items-center justify-center rounded hover:bg-black/10">
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {messages.find((m) => m.snoozedUntil)?.snoozedUntil ? (
              <span className="text-[12px] text-warn">Snoozed until {fullDate(messages.find((m) => m.snoozedUntil)!.snoozedUntil!, prefs)}</span>
            ) : null}
          </div>
        </header>
        <ul className="divide-y divide-line">
          {messages.map((m) => (
            <MessageItem
              key={m.id}
              m={m}
              isLast={m.id === last?.id}
              expanded={expanded.has(m.id)}
              onToggle={() =>
                setExpanded((s) => {
                  const n = new Set(s);
                  if (n.has(m.id)) n.delete(m.id);
                  else n.add(m.id);
                  return n;
                })
              }
              onReply={(mode, sourceMessageId) => setReply({ mode, sourceMessageId })}
              onEditDraft={(draftId) => setReply({ draftId })}
            />
          ))}
        </ul>
        <div ref={replyRef} className="px-4 pt-2 pb-10 sm:px-6 sm:pl-[72px]">
          {reply ? (
            <div className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-md">
              <Composer
                key={"draftId" in reply ? reply.draftId : `${reply.mode}-${reply.sourceMessageId}`}
                variant="inline"
                request={"draftId" in reply ? { draftId: reply.draftId } : { mode: reply.mode, sourceMessageId: reply.sourceMessageId }}
                onClose={() => {
                  setReply(null);
                  void refetch();
                }}
                onSent={() => void refetch()}
              />
            </div>
          ) : last && !isSpam ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setReply({ mode: "reply", sourceMessageId: last.id })}>
                <Reply className="size-4" />
                Reply
              </Button>
              {last.to.length + last.cc.length > 1 ? (
                <Button onClick={() => setReply({ mode: "reply_all", sourceMessageId: last.id })}>
                  <ReplyAll className="size-4" />
                  Reply all
                </Button>
              ) : null}
              <Button onClick={() => setReply({ mode: "forward", sourceMessageId: last.id })}>
                <Forward className="size-4" />
                Forward
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
