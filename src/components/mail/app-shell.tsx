"use client";

import { Dialog as D } from "radix-ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MailWarning } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { api, UNAUTHORIZED_EVENT } from "@/lib/client/api";
import { qk, useLabels, useMe, useSettings } from "@/lib/client/hooks";
import { useRealtime } from "@/lib/client/realtime";
import { applyTheme } from "@/lib/client/theme";
import type { LabelDTO, MeDTO, SettingsDTO } from "@/lib/types";
import { AppContext, type ComposeRequest } from "./app-context";
import { FloatingComposers, type FloatingEntry } from "./composer/floating-composers";
import { LabelDialog } from "./label-dialog";
import { Rail } from "./rail";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return Boolean(t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)));
}

export function AppShell({
  initialMe,
  initialSettings,
  initialLabels,
  children,
}: {
  initialMe: MeDTO;
  initialSettings: SettingsDTO;
  initialLabels: LabelDTO[];
  children: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const { data: me = initialMe } = useMe(initialMe);
  const { data: settings = initialSettings } = useSettings(initialSettings);
  const { data: labels = initialLabels } = useLabels(initialLabels);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [labelDialog, setLabelDialog] = useState<{ open: boolean; label?: LabelDTO; key: number }>({ open: false, key: 0 });
  const [composers, setComposers] = useState<FloatingEntry[]>([]);
  const counter = useRef(0);

  const openCompose = useCallback((request: ComposeRequest = {}) => {
    setComposers((list) => {
      if (request.draftId && list.some((c) => c.request.draftId === request.draftId)) {
        return list.map((c) => (c.request.draftId === request.draftId ? { ...c, minimized: false } : c));
      }
      const next = [...list.map((c) => ({ ...c, minimized: true })), { key: `c${counter.current++}`, request, minimized: false }];
      return next.slice(-3);
    });
  }, []);

  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  // Adopt the device time zone once if the account still has the default.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const lang = navigator.language;
      if (settings.timeZone === "UTC" && tz && tz !== "UTC" && !localStorage.getItem("mailed:tz-adopted")) {
        localStorage.setItem("mailed:tz-adopted", "1");
        const patch: Partial<SettingsDTO> = { timeZone: tz };
        if (settings.locale === "en-US" && lang && lang !== "en-US") patch.locale = lang;
        void api<SettingsDTO>("/api/settings", { method: "PATCH", body: patch }).then((s) => qc.setQueryData(qk.settings, s)).catch(() => undefined);
      }
    } catch {
      /* storage unavailable */
    }
  }, [settings.timeZone, settings.locale, qc]);

  useEffect(() => {
    const onUnauthorized = () => {
      toast.error("Your session has ended. Please sign in again.");
      router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  useEffect(() => {
    if (params.get("welcome") === "1") {
      toast(`Welcome to Mailed, ${me.firstName}. Your address is ${me.address}.`);
      router.replace(location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let pendingG = false;
    let gTimer: ReturnType<typeof setTimeout> | undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (document.querySelector("[role=dialog]")) return;
      if (pendingG) {
        pendingG = false;
        const map: Record<string, string> = { i: "/app/inbox", s: "/app/starred", t: "/app/sent", d: "/app/drafts", a: "/app/all", c: "/app/contacts" };
        if (map[e.key]) {
          e.preventDefault();
          router.push(map[e.key]);
        }
        return;
      }
      if (e.key === "g") {
        pendingG = true;
        clearTimeout(gTimer);
        gTimer = setTimeout(() => (pendingG = false), 1200);
      } else if (e.key === "c") {
        e.preventDefault();
        openCompose();
      } else if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, openCompose]);

  useRealtime(settings, (threadId) => router.push(`/app/inbox/${threadId}`));

  const ctx = useMemo(
    () => ({
      me,
      settings,
      labels,
      prefs: { locale: settings.locale, timeZone: settings.timeZone },
      openCompose,
      sidebarOpen,
      setSidebarOpen,
      openShortcuts: () => setShortcutsOpen(true),
      openLabelDialog: (label?: LabelDTO) => setLabelDialog((s) => ({ open: true, label, key: s.key + 1 })),
    }),
    [me, settings, labels, openCompose, sidebarOpen],
  );

  return (
    <AppContext.Provider value={ctx}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md">
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden bg-canvas">
        <aside className="hidden w-60 shrink-0 border-r border-line bg-sidebar lg:block">
          <Sidebar />
        </aside>
        <aside className="hidden w-[60px] shrink-0 border-r border-line bg-sidebar md:block lg:hidden">
          <Rail />
        </aside>
        <D.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <D.Portal>
            <D.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in lg:hidden" />
            <D.Content className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] border-r border-line bg-sidebar shadow-lg animate-slide-in focus:outline-none lg:hidden">
              <D.Title className="sr-only">Navigation</D.Title>
              <D.Description className="sr-only">Mailboxes, categories and labels</D.Description>
              <Sidebar onNavigate={() => setSidebarOpen(false)} />
            </D.Content>
          </D.Portal>
        </D.Root>
        <div className="flex min-w-0 flex-1 flex-col">
          {!me.emailVerified ? (
            <div role="status" className="flex shrink-0 items-center gap-2 border-b border-warn/20 bg-warn-soft px-4 py-2 text-[12px] text-warn">
              <MailWarning className="size-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1">
                Confirm your recovery email ({me.recoveryEmail}) to send mail outside Mailed and to be able to reset your password.
              </span>
              <a href="/verify-email" className="shrink-0 font-medium underline underline-offset-2">
                Resend link
              </a>
            </div>
          ) : null}
          <Topbar />
          <main id="main" className="relative min-h-0 flex-1">
            {children}
          </main>
        </div>
      </div>
      <FloatingComposers
        entries={composers}
        onClose={(key) => setComposers((list) => list.filter((c) => c.key !== key))}
        onToggleMinimize={(key) => setComposers((list) => list.map((c) => (c.key === key ? { ...c, minimized: !c.minimized } : c)))}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <LabelDialog key={labelDialog.key} open={labelDialog.open} label={labelDialog.label} onOpenChange={(open) => setLabelDialog((s) => ({ ...s, open }))} />
    </AppContext.Provider>
  );
}
