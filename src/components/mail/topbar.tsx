"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Contact, Keyboard, LogOut, Menu, Monitor, Settings } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { ThemeDot } from "@/components/ui/theme-swatch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, errorMessage } from "@/lib/client/api";
import { relativeTime } from "@/lib/client/format";
import { qk, useNotifications } from "@/lib/client/hooks";
import { applyTheme, type ThemePref } from "@/lib/client/theme";
import { cn } from "@/lib/cn";
import { THEMES } from "@/lib/themes";
import type { SettingsDTO } from "@/lib/types";
import { useApp } from "./app-context";
import { SearchBox } from "./search-box";

function NotificationsMenu() {
  const { data } = useNotifications();
  const { prefs } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const unread = data?.unread ?? 0;

  const markAll = async () => {
    await api("/api/notifications/read", { body: {} }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: qk.notifications });
  };

  return (
    <Popover onOpenChange={(open) => !open && unread > 0 && void markAll()}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative">
          <Bell className="size-[17px]" />
          {unread ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent ring-2 ring-canvas" aria-hidden /> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-1rem))] p-0" aria-label="Notifications">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[13px] font-semibold">Notifications</h2>
          {unread ? (
            <Button variant="ghost" size="xs" onClick={markAll}>
              <CheckCheck className="size-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <ul className="max-h-96 overflow-y-auto scrollbar-thin">
          {data && data.items.length === 0 ? <li className="px-4 py-10 text-center text-[13px] text-ink-subtle">No notifications yet.</li> : null}
          {data?.items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => n.threadId && router.push(`/app/inbox/${n.threadId}`)}
                className={cn("flex w-full gap-3 border-b border-line px-4 py-3 text-left last:border-0 hover:bg-hover", !n.threadId && "cursor-default")}
              >
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-accent")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">{n.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-ink-subtle">{n.body}</span>
                  <span className="mt-1 block text-[11px] text-ink-subtle">{relativeTime(n.createdAt, prefs)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function AccountMenu() {
  const { me, settings, openShortcuts } = useApp();
  const qc = useQueryClient();
  const router = useRouter();

  const setTheme = async (theme: ThemePref) => {
    applyTheme(theme);
    qc.setQueryData<SettingsDTO>(qk.settings, (s) => (s ? { ...s, theme } : s));
    try {
      await api("/api/settings", { method: "PATCH", body: { theme } });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const signOut = async () => {
    await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => undefined);
    qc.clear();
    router.replace("/login");
    router.refresh();
  };

  const name = `${me.firstName} ${me.lastName}`.trim();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className="ml-1 rounded-full">
          <Avatar name={name} email={me.address} src={me.avatarUrl} size={30} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar name={name} email={me.address} src={me.avatarUrl} size={36} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-ink">{name}</p>
            <p className="truncate text-xs text-ink-subtle">{me.address}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<Settings />} onSelect={() => router.push("/app/settings")}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem icon={<Contact />} onSelect={() => router.push("/app/contacts")}>
          Contacts
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger icon={settings.theme === "system" ? <Monitor /> : <ThemeDot id={settings.theme} />}>
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem icon={<Monitor />} shortcut={settings.theme === "system" ? "✓" : undefined} onSelect={() => void setTheme("system")}>
              System
            </DropdownMenuItem>
            {(["light", "dark"] as const).map((mode) => (
              <DropdownMenuGroup key={mode}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>{mode === "light" ? "Light" : "Dark"}</DropdownMenuLabel>
                {THEMES.filter((t) => t.mode === mode).map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    icon={<ThemeDot id={t.id} />}
                    shortcut={settings.theme === t.id ? "✓" : undefined}
                    onSelect={() => void setTheme(t.id)}
                  >
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem icon={<Keyboard />} shortcut="?" onSelect={openShortcuts}>
          Keyboard shortcuts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem icon={<LogOut />} onSelect={() => void signOut()}>
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Topbar() {
  const { setSidebarOpen, openShortcuts } = useApp();
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2 sm:px-4">
      <IconButton label="Open navigation" icon={<Menu />} className="lg:hidden" onClick={() => setSidebarOpen(true)} />
      <SearchBox className="max-w-2xl flex-1" />
      <div className="ml-auto flex items-center gap-0.5">
        <IconButton label="Keyboard shortcuts" icon={<Keyboard />} shortcut="?" className="hidden md:inline-flex" onClick={openShortcuts} />
        <NotificationsMenu />
        <AccountMenu />
      </div>
    </header>
  );
}
