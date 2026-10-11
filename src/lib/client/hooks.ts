"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import type {
  ContactDTO,
  LabelDTO,
  MailboxCounts,
  MeDTO,
  SettingsDTO,
  ThreadDetail,
  ThreadListResponse,
  ViewRef,
} from "@/lib/types";
import { api, errorMessage } from "./api";

export const qk = {
  me: ["me"] as const,
  settings: ["settings"] as const,
  labels: ["labels"] as const,
  counts: ["counts"] as const,
  threads: (key: string) => ["threads", key] as const,
  thread: (id: string, viewKey: string) => ["thread", id, viewKey] as const,
  notifications: ["notifications"] as const,
  contacts: (q: string) => ["contacts", q] as const,
  linkedAccounts: ["linked-accounts"] as const,
};

export function viewKey(view: ViewRef, filter?: string) {
  const base = view.kind === "system" ? view.view : view.kind === "label" ? `label:${view.labelId}` : `search:${view.query}`;
  return filter ? `${base}|${filter}` : base;
}

export function viewParams(view: ViewRef) {
  const p = new URLSearchParams();
  if (view.kind === "system") p.set("view", view.view);
  else if (view.kind === "label") p.set("label", view.labelId);
  else p.set("q", view.query);
  return p;
}

export function useMe(initial?: MeDTO) {
  return useQuery({ queryKey: qk.me, queryFn: () => api<MeDTO>("/api/me"), initialData: initial, staleTime: 60_000 });
}

export function useSettings(initial?: SettingsDTO) {
  return useQuery({ queryKey: qk.settings, queryFn: () => api<SettingsDTO>("/api/settings"), initialData: initial, staleTime: 5 * 60_000 });
}

export function useLabels(initial?: LabelDTO[]) {
  return useQuery({
    queryKey: qk.labels,
    queryFn: async () => (await api<{ labels: LabelDTO[] }>("/api/labels")).labels,
    initialData: initial,
    staleTime: 60_000,
  });
}

export function useCounts() {
  return useQuery({
    queryKey: qk.counts,
    queryFn: () => api<MailboxCounts>("/api/mailbox/counts"),
    refetchInterval: 60_000,
  });
}

export function useThreads(view: ViewRef, filter?: string) {
  const key = viewKey(view, filter);
  return useInfiniteQuery({
    queryKey: qk.threads(key),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const p = viewParams(view);
      if (filter) p.set("filter", filter);
      if (pageParam) p.set("cursor", pageParam);
      return api<ThreadListResponse>(`/api/threads?${p}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: 90_000,
  });
}

export function useThread(threadId: string | null, view: ViewRef) {
  const key = viewKey(view);
  return useQuery({
    queryKey: qk.thread(threadId ?? "", key),
    enabled: Boolean(threadId),
    queryFn: ({ signal }) => api<ThreadDetail>(`/api/threads/${threadId}?${viewParams(view)}`, { signal }),
  });
}

export type MailAction =
  | { type: "archive" }
  | { type: "move_to_inbox" }
  | { type: "trash" }
  | { type: "delete_forever" }
  | { type: "spam" }
  | { type: "not_spam" }
  | { type: "mark_read" }
  | { type: "mark_unread" }
  | { type: "star" }
  | { type: "unstar" }
  | { type: "important" }
  | { type: "not_important" }
  | { type: "snooze"; until: string }
  | { type: "unsnooze" }
  | { type: "add_label"; labelId: string }
  | { type: "remove_label"; labelId: string }
  | { type: "set_category"; category: string }
  | { type: "block_sender" };

const REMOVES_FROM_VIEW = new Set(["archive", "move_to_inbox", "trash", "delete_forever", "spam", "not_spam", "snooze", "unsnooze", "set_category", "block_sender"]);

const UNDO: Partial<Record<MailAction["type"], MailAction>> = {
  archive: { type: "move_to_inbox" },
  trash: { type: "move_to_inbox" },
  spam: { type: "not_spam" },
  mark_read: { type: "mark_unread" },
  mark_unread: { type: "mark_read" },
};

const DONE: Partial<Record<MailAction["type"], (n: number) => string>> = {
  archive: (n) => (n === 1 ? "Conversation archived" : `${n} conversations archived`),
  move_to_inbox: (n) => (n === 1 ? "Moved to Inbox" : `${n} conversations moved to Inbox`),
  trash: (n) => (n === 1 ? "Moved to Trash" : `${n} conversations moved to Trash`),
  delete_forever: (n) => (n === 1 ? "Deleted forever" : `${n} conversations deleted forever`),
  spam: (n) => (n === 1 ? "Reported as spam" : `${n} conversations reported as spam`),
  not_spam: () => "Moved out of Spam",
  snooze: () => "Snoozed",
  unsnooze: () => "Unsnoozed",
  set_category: () => "Category updated. Future messages from this sender will follow.",
  block_sender: () => "Sender blocked. Their messages will go to Spam.",
  add_label: () => "Label applied",
  remove_label: () => "Label removed",
};

/**
 * Runs a mailbox action with optimistic list updates, a confirmation toast
 * with Undo where it makes sense, and cache invalidation.
 */
export function useMailAction() {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (vars: { threadIds?: string[]; messageIds?: string[]; action: MailAction }) => api<{ affected: number }>("/api/actions", { body: vars }),
  });

  return useCallback(
    async (target: { threadIds?: string[]; messageIds?: string[] }, action: MailAction, opts: { silent?: boolean; undoable?: boolean } = {}) => {
      const ids = new Set(target.threadIds ?? []);
      const snapshots = qc.getQueriesData<InfiniteData<ThreadListResponse>>({ queryKey: ["threads"] });
      if (ids.size > 0) {
        qc.setQueriesData<InfiniteData<ThreadListResponse>>({ queryKey: ["threads"] }, (data) => {
          if (!data) return data;
          return {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              threads: REMOVES_FROM_VIEW.has(action.type)
                ? p.threads.filter((t) => !ids.has(t.id))
                : p.threads.map((t) => {
                    if (!ids.has(t.id)) return t;
                    if (action.type === "mark_read") return { ...t, unread: false };
                    if (action.type === "mark_unread") return { ...t, unread: true };
                    if (action.type === "star") return { ...t, starred: true };
                    if (action.type === "unstar") return { ...t, starred: false };
                    if (action.type === "important") return { ...t, important: true };
                    if (action.type === "not_important") return { ...t, important: false };
                    return t;
                  }),
            })),
          };
        });
      }
      try {
        const res = await mutation.mutateAsync({ ...target, action });
        const n = target.threadIds?.length ?? target.messageIds?.length ?? res.affected;
        const undo = UNDO[action.type];
        if (!opts.silent && DONE[action.type]) {
          toast(DONE[action.type]!(n), {
            action:
              undo && opts.undoable !== false
                ? {
                    label: "Undo",
                    onClick: async () => {
                      await api("/api/actions", { body: { ...target, action: undo } }).catch((e) => toast.error(errorMessage(e)));
                      await qc.invalidateQueries({ queryKey: ["threads"] });
                      await qc.invalidateQueries({ queryKey: ["thread"] });
                      await qc.invalidateQueries({ queryKey: qk.counts });
                    },
                  }
                : undefined,
          });
        }
        return res;
      } catch (err) {
        for (const [key, data] of snapshots) qc.setQueryData(key, data);
        toast.error(errorMessage(err));
        throw err;
      } finally {
        void qc.invalidateQueries({ queryKey: ["threads"] });
        void qc.invalidateQueries({ queryKey: ["thread"] });
        void qc.invalidateQueries({ queryKey: qk.counts });
      }
    },
    [qc, mutation],
  );
}

export function useContactSuggestions(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["contact-suggest", q],
    enabled,
    queryFn: ({ signal }) => api<{ suggestions: ContactDTO[] }>(`/api/contacts/suggest?q=${encodeURIComponent(q)}`, { signal }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export type NotificationItem = { id: string; type: string; title: string; body: string; threadId: string | null; read: boolean; createdAt: string };

export function useNotifications() {
  return useQuery({
    queryKey: qk.notifications,
    queryFn: () => api<{ unread: number; items: NotificationItem[] }>("/api/notifications"),
    refetchInterval: 120_000,
  });
}
