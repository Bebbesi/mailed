"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Inbox, MailOpen, SearchX, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { api, errorMessage } from "@/lib/client/api";
import { qk, useCounts, useLabels, useMailAction, useThreads, type MailAction } from "@/lib/client/hooks";
import { useMediaQuery } from "@/lib/client/use-media-query";
import { VIEW_META, viewHref } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import type { ThreadSummary, ViewRef } from "@/lib/types";
import { useApp } from "./app-context";
import { FilterBar, filtersToQuery, NO_FILTERS, type Filters } from "./filter-bar";
import { ListToolbar, type SelectMode } from "./list-toolbar";
import { ThreadRow } from "./thread-row";
import { ThreadView } from "./thread-view";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)));
}

const CATEGORY_TABS = [
  { view: "inbox", label: "Primary" },
  { view: "social", label: "Social" },
  { view: "promotions", label: "Promotions" },
  { view: "updates", label: "Updates" },
  { view: "forums", label: "Forums" },
] as const;

function CategoryTabs({ current }: { current: string }) {
  const { data: counts } = useCounts();
  return (
    <nav aria-label="Inbox categories" className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 scrollbar-thin">
      {CATEGORY_TABS.map((t) => {
        const active = current === t.view;
        const unread = counts?.unread[t.view] ?? 0;
        const Icon = t.view === "inbox" ? Inbox : VIEW_META[t.view].icon;
        return (
          <Link
            key={t.view}
            href={`/app/${t.view}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-2.5 text-[13px] transition-colors",
              active ? "border-ink font-medium text-ink" : "border-transparent text-ink-subtle hover:text-ink",
            )}
          >
            <Icon className="hidden size-4 2xl:inline" aria-hidden />
            {t.label}
            {unread > 0 && t.view !== "inbox" ? <span className="rounded-full bg-accent px-1.5 text-[10px] leading-4 font-semibold text-accent-fg">{unread}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function Mailbox({ view, threadId }: { view: ViewRef; threadId: string | null }) {
  const router = useRouter();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const { settings, prefs, openCompose, labels: initialLabels } = useApp();
  const { data: labels = initialLabels } = useLabels(initialLabels);
  const run = useMailAction();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const split = settings.readingPane === "right" && isDesktop;

  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const filter = filtersToQuery(filters);
  const query = useThreads(view, filter || undefined);
  const threads = useMemo(() => query.data?.pages.flatMap((p) => p.threads) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const [rawSelected, setSelected] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [replyRequest, setReplyRequest] = useState<{ mode: "reply" | "reply_all" | "forward"; nonce: number } | null>(null);
  const lastChecked = useRef<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Only conversations still in the list can stay selected.
  const selected = useMemo(() => rawSelected.filter((id) => threads.some((t) => t.id === id)), [rawSelected, threads]);

  // Load more when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [query]);

  const open = useCallback(
    (t: ThreadSummary | string) => {
      const id = typeof t === "string" ? t : t.id;
      const thread = typeof t === "string" ? threads.find((x) => x.id === t) : t;
      setFocusId(id);
      if (thread && view.kind === "system" && view.view === "drafts" && thread.hasDraft && thread.messageCount <= 1) {
        openCompose({ draftId: thread.latestMessageId });
        return;
      }
      router.push(viewHref(view, id));
    },
    [router, view, threads, openCompose],
  );

  const back = useCallback(() => router.push(viewHref(view)), [router, view]);

  const index = threadId ? threads.findIndex((t) => t.id === threadId) : -1;
  const navigate = (dir: -1 | 1) => {
    const next = threads[index + dir];
    if (next) open(next);
  };

  const doAction = useCallback(
    async (ids: string[], action: MailAction) => {
      if (ids.length === 0) return;
      if (action.type === "delete_forever") {
        const ok = await confirm({
          title: ids.length === 1 ? "Delete this conversation forever?" : `Delete ${ids.length} conversations forever?`,
          description: "This can't be undone.",
          confirmLabel: "Delete forever",
          destructive: true,
        });
        if (!ok) return;
      }
      if (action.type === "block_sender") {
        const ok = await confirm({
          title: "Block these senders?",
          description: "Their messages will go to Spam. You can unblock them in Settings → Filters & senders.",
          confirmLabel: "Block",
          destructive: true,
        });
        if (!ok) return;
      }
      const leaving = threadId && ids.includes(threadId) && ["archive", "trash", "delete_forever", "spam", "not_spam", "snooze", "move_to_inbox", "block_sender"].includes(action.type);
      const nextThread = leaving ? threads.find((t, i) => i > index && !ids.includes(t.id)) ?? threads.find((t) => !ids.includes(t.id)) : null;
      try {
        await run({ threadIds: ids }, action);
        setSelected((s) => s.filter((id) => !ids.includes(id)));
        if (leaving) {
          if (split && nextThread) router.replace(viewHref(view, nextThread.id));
          else router.push(viewHref(view));
        }
      } catch {
        /* toast shown by hook */
      }
    },
    [confirm, run, threadId, threads, index, split, router, view],
  );

  const select = (mode: SelectMode) => {
    const pick = {
      all: () => true,
      none: () => false,
      read: (t: ThreadSummary) => !t.unread,
      unread: (t: ThreadSummary) => t.unread,
      starred: (t: ThreadSummary) => t.starred,
      unstarred: (t: ThreadSummary) => !t.starred,
    }[mode];
    setSelected(threads.filter(pick).map((t) => t.id));
  };

  const onCheck = useCallback(
    (id: string, checked: boolean, shift: boolean) => {
      setSelected((s) => {
        if (shift && lastChecked.current) {
          const a = threads.findIndex((t) => t.id === lastChecked.current);
          const b = threads.findIndex((t) => t.id === id);
          if (a >= 0 && b >= 0) {
            const range = threads.slice(Math.min(a, b), Math.max(a, b) + 1).map((t) => t.id);
            return checked ? [...new Set([...s, ...range])] : s.filter((x) => !range.includes(x));
          }
        }
        return checked ? [...s, id] : s.filter((x) => x !== id);
      });
      lastChecked.current = id;
    },
    [threads],
  );

  const onStar = useCallback((t: ThreadSummary) => void run({ threadIds: [t.id] }, { type: t.starred ? "unstar" : "star" }, { silent: true }).catch(() => undefined), [run]);
  const onQuick = useCallback(
    (t: ThreadSummary, a: "archive" | "trash" | "read" | "unread") => {
      const action: MailAction =
        a === "archive" ? { type: "archive" } : a === "trash" ? (t.folder === "trash" ? { type: "delete_forever" } : { type: "trash" }) : a === "read" ? { type: "mark_read" } : { type: "mark_unread" };
      void doAction([t.id], action);
    },
    [doAction],
  );

  // Keyboard triage.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (document.querySelector("[role=dialog], [role=menu]")) return;
      const cur = focusId ?? threadId;
      const curIndex = cur ? threads.findIndex((t) => t.id === cur) : -1;
      const targetIds = selected.length ? selected : threadId ? [threadId] : cur ? [cur] : [];
      const key = e.key;
      const move = (dir: 1 | -1) => {
        const next = threads[Math.max(0, Math.min(threads.length - 1, curIndex + dir))];
        if (!next) return;
        if (threadId && !split) open(next);
        else if (threadId && split) open(next);
        else {
          setFocusId(next.id);
          listRef.current?.querySelector(`[data-thread-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
        }
      };
      const handled = () => e.preventDefault();
      if (key === "j" || key === "ArrowDown") {
        if (key === "ArrowDown" && threadId && !split) return;
        handled();
        move(1);
      } else if (key === "k" || key === "ArrowUp") {
        if (key === "ArrowUp" && threadId && !split) return;
        handled();
        move(-1);
      } else if ((key === "Enter" || key === "o") && focusId && focusId !== threadId) {
        handled();
        open(focusId);
      } else if (key === "u" && threadId) {
        handled();
        back();
      } else if (key === "x" && cur) {
        handled();
        onCheck(cur, !selected.includes(cur), false);
      } else if (key === "e" && targetIds.length) {
        handled();
        void doAction(targetIds, { type: "archive" });
      } else if (key === "#" && targetIds.length) {
        handled();
        void doAction(targetIds, { type: "trash" });
      } else if (key === "!" && targetIds.length) {
        handled();
        void doAction(targetIds, { type: "spam" });
      } else if (key === "s" && cur) {
        const t = threads.find((x) => x.id === cur);
        if (t) {
          handled();
          onStar(t);
        }
      } else if (key === "I" && e.shiftKey && targetIds.length) {
        handled();
        void doAction(targetIds, { type: "mark_read" });
      } else if (key === "U" && e.shiftKey && targetIds.length) {
        handled();
        void doAction(targetIds, { type: "mark_unread" });
      } else if (key === "b" && threadId) {
        handled();
        setSnoozeOpen(true);
      } else if ((key === "r" || key === "a" || key === "f") && threadId) {
        handled();
        setReplyRequest({ mode: key === "r" ? "reply" : key === "a" ? "reply_all" : "forward", nonce: Date.now() });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [threads, focusId, threadId, selected, split, open, back, doAction, onCheck, onStar]);

  const isTrash = view.kind === "system" && view.view === "trash";
  const isSpam = view.kind === "system" && view.view === "spam";
  const showCategoryTabs = settings.inboxCategories && view.kind === "system" && ["inbox", "social", "promotions", "updates", "forums"].includes(view.view);
  const title =
    view.kind === "system" ? VIEW_META[view.view].label : view.kind === "label" ? (labels.find((l) => l.id === view.labelId)?.name ?? "Label") : "Search results";
  const pageCount = threads.length;
  const range = total === 0 ? "" : `${pageCount === 0 ? 0 : 1}–${pageCount} of ${total}`;

  const emptyMeta =
    view.kind === "system"
      ? VIEW_META[view.view].empty
      : view.kind === "label"
        ? { title: "No conversations with this label", description: "Apply the label from a conversation's toolbar." }
        : { title: "No messages match your search", description: "Try different words or remove some filters." };

  const list = (
    <section aria-label={title} className={cn("flex h-full min-h-0 flex-col", split && "w-[min(42%,520px)] shrink-0 border-r border-line xl:w-[min(40%,560px)]")}>
      <h1 className="sr-only">{title}</h1>
      {showCategoryTabs ? <CategoryTabs current={view.kind === "system" ? view.view : ""} /> : null}
      {view.kind === "search" ? (
        <div className="shrink-0 border-b border-line px-4 py-2.5 text-[13px] text-ink-subtle">
          Results for <span className="font-medium text-ink">{view.query}</span>
          {total ? ` · ${total} conversation${total === 1 ? "" : "s"}` : ""}
        </div>
      ) : null}
      <ListToolbar
        view={view}
        threads={threads}
        selected={selected}
        onSelect={select}
        onClear={() => setSelected([])}
        onAction={(a) => void doAction(selected, a)}
        onRefresh={() => {
          void query.refetch();
          void qc.invalidateQueries({ queryKey: qk.counts });
        }}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        range={range}
      />
      {view.kind !== "search" ? <FilterBar value={filters} onChange={setFilters} /> : null}
      {(isTrash || isSpam) && threads.length > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line bg-hover px-4 py-2 text-[12px] text-ink-muted">
          <span>Messages in {isTrash ? "Trash" : "Spam"} are deleted forever after 30 days.</span>
          <Button
            variant="link"
            size="xs"
            onClick={async () => {
              const ok = await confirm({
                title: isTrash ? "Empty Trash?" : "Delete all spam?",
                description: "All messages here will be deleted forever. This can't be undone.",
                confirmLabel: isTrash ? "Empty Trash" : "Delete all",
                destructive: true,
              });
              if (!ok) return;
              try {
                const res = await api<{ deleted: number }>(`/api/folders/${isTrash ? "trash" : "spam"}/empty`, { method: "POST", body: {} });
                toast(`${res.deleted} message${res.deleted === 1 ? "" : "s"} deleted forever`);
                void qc.invalidateQueries({ queryKey: ["threads"] });
                void qc.invalidateQueries({ queryKey: qk.counts });
                if (threadId) back();
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          >
            <Trash2 className="size-3.5" />
            {isTrash ? "Empty Trash now" : "Delete all spam now"}
          </Button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {query.isLoading ? (
          <ul aria-busy="true" aria-label="Loading conversations">
            {Array.from({ length: 10 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Skeleton className="size-4" />
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3.5 flex-1" />
                <Skeleton className="h-3.5 w-10" />
              </li>
            ))}
          </ul>
        ) : query.isError ? (
          <EmptyState
            icon={<AlertCircle />}
            title="Couldn't load conversations"
            description={errorMessage(query.error)}
            action={
              <Button size="sm" onClick={() => void query.refetch()}>
                Try again
              </Button>
            }
          />
        ) : threads.length === 0 ? (
          filter ? (
            <EmptyState
              icon={<SearchX />}
              title="No conversations match these filters"
              action={
                <Button size="sm" variant="secondary" onClick={() => setFilters(NO_FILTERS)}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState icon={view.kind === "search" ? <SearchX /> : view.kind === "system" ? (() => { const I = VIEW_META[view.view].icon; return <I />; })() : <MailOpen />} title={emptyMeta.title} description={emptyMeta.description} />
          )
        ) : (
          <>
            <ul ref={listRef} aria-label="Conversations">
              {threads.map((t) => (
                <ThreadRow
                  key={t.id}
                  thread={t}
                  href={viewHref(view, t.id)}
                  selected={t.id === threadId}
                  checked={selected.includes(t.id)}
                  focused={t.id === focusId && t.id !== threadId}
                  layout={split || !isDesktop ? "stacked" : "line"}
                  density={settings.density}
                  prefs={prefs}
                  showCategory={view.kind !== "system" || view.view === "all" || view.view === "starred" || view.view === "important"}
                  onCheck={onCheck}
                  onStar={onStar}
                  onQuick={onQuick}
                  onOpen={open}
                  quickArchive={t.folder === "inbox"}
                />
              ))}
            </ul>
            <div ref={sentinel} className="flex h-16 items-center justify-center">
              {query.isFetchingNextPage ? (
                <Spinner label="Loading more" className="text-ink-subtle" />
              ) : query.hasNextPage ? (
                <Button variant="ghost" size="sm" onClick={() => void query.fetchNextPage()}>
                  Load more
                </Button>
              ) : threads.length > 20 ? (
                <span className="text-xs text-ink-subtle">That&apos;s everything</span>
              ) : null}
            </div>
          </>
        )}
      </div>
    </section>
  );

  const reader = threadId ? (
    <ThreadView
      key={threadId}
      threadId={threadId}
      view={view}
      onBack={back}
      onNavigate={navigate}
      position={index >= 0 ? { index, total: threads.length } : null}
      showBack={!split}
      snoozeOpen={snoozeOpen}
      onSnoozeOpenChange={setSnoozeOpen}
      replyRequest={replyRequest}
    />
  ) : null;

  if (split) {
    return (
      <div className="flex h-full min-h-0">
        {list}
        <section aria-label="Reading pane" className="min-w-0 flex-1 bg-surface">
          {reader ?? (
            <EmptyState
              className="h-full"
              icon={<MailOpen />}
              title="No conversation selected"
              description={threads.length ? "Select a conversation to read it here. Use J and K to move through the list." : undefined}
            />
          )}
        </section>
      </div>
    );
  }
  return <div className="h-full min-h-0 bg-surface">{reader ?? list}</div>;
}
