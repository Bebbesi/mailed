"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { SettingsDTO } from "@/lib/types";
import { UNAUTHORIZED_EVENT } from "./api";
import { qk } from "./hooks";

type NewMail = { threadId: string; messageId: string; notify: boolean; title?: string; body?: string };

/**
 * Subscribes to /api/events. EventSource reconnects on its own; queries also
 * poll, so a dropped connection only delays updates.
 */
export function useRealtime(settings: SettingsDTO | undefined, onOpenThread: (threadId: string) => void) {
  const qc = useQueryClient();
  const settingsRef = useRef(settings);
  const openRef = useRef(onOpenThread);
  useEffect(() => {
    settingsRef.current = settings;
    openRef.current = onOpenThread;
  });

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const es = new EventSource("/api/events");
    const refresh = () => {
      void qc.invalidateQueries({ queryKey: ["threads"] });
      void qc.invalidateQueries({ queryKey: qk.counts });
    };

    es.addEventListener("mail.new", (ev) => {
      refresh();
      const data = JSON.parse((ev as MessageEvent).data) as NewMail;
      void qc.invalidateQueries({ queryKey: ["thread", data.threadId] });
      void qc.invalidateQueries({ queryKey: qk.notifications });
      if (!data.notify) return;
      const s = settingsRef.current;
      if (s?.notifyInApp !== false) {
        toast(data.title ?? "New message", {
          description: data.body,
          action: { label: "Open", onClick: () => openRef.current(data.threadId) },
        });
      }
      if (s?.notifyBrowser && document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
        const n = new Notification(data.title ?? "New message", { body: data.body, tag: data.messageId, icon: "/icon.svg" });
        n.onclick = () => {
          window.focus();
          openRef.current(data.threadId);
          n.close();
        };
      }
    });
    es.addEventListener("mail.changed", (ev) => {
      refresh();
      const data = JSON.parse((ev as MessageEvent).data) as { threadIds?: string[] };
      for (const id of data.threadIds ?? []) void qc.invalidateQueries({ queryKey: ["thread", id] });
    });
    es.addEventListener("send.status", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { threadId: string; status: string; error?: string | null };
      refresh();
      void qc.invalidateQueries({ queryKey: ["thread", data.threadId] });
      if (data.status === "failed") toast.error("Message not sent", { description: data.error ?? undefined });
      if (data.status === "bounced") toast.error("Message bounced", { description: data.error ?? undefined });
    });
    es.addEventListener("notification", (ev) => {
      const data = JSON.parse((ev as MessageEvent).data) as { title: string; body: string; threadId?: string | null };
      void qc.invalidateQueries({ queryKey: qk.notifications });
      if (settingsRef.current?.notifyInApp !== false) {
        toast(data.title, {
          description: data.body,
          action: data.threadId ? { label: "Open", onClick: () => openRef.current(data.threadId!) } : undefined,
        });
      }
    });
    es.addEventListener("session.expired", () => {
      es.close();
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    });
    return () => es.close();
  }, [qc]);
}
