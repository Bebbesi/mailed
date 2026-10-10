"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Pencil, Settings } from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { Tooltip } from "@/components/ui/tooltip";
import { useCounts } from "@/lib/client/hooks";
import { VIEW_META } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import type { SystemView } from "@/lib/types";
import { useApp } from "./app-context";

const ITEMS: SystemView[] = ["inbox", "starred", "snoozed", "sent", "drafts", "archive", "spam", "trash"];

/** Collapsed navigation for tablet widths. */
export function Rail() {
  const pathname = usePathname();
  const { openCompose, setSidebarOpen } = useApp();
  const { data: counts } = useCounts();
  return (
    <nav aria-label="Mailboxes" className="flex h-full flex-col items-center gap-1 py-3">
      <Link href="/app/inbox" aria-label="Mailed inbox" className="mb-2 rounded-md">
        <LogoMark />
      </Link>
      <Tooltip content="Show all folders" side="right">
        <button type="button" aria-label="Show all folders" onClick={() => setSidebarOpen(true)} className="flex size-10 items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink">
          <Menu className="size-[18px]" />
        </button>
      </Tooltip>
      <Tooltip content="Compose" side="right">
        <button type="button" aria-label="Compose" onClick={() => openCompose()} className="mb-2 flex size-10 items-center justify-center rounded-md bg-accent text-accent-fg hover:bg-accent-hover">
          <Pencil className="size-[18px]" />
        </button>
      </Tooltip>
      {ITEMS.map((v) => {
        const href = `/app/${v}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const Icon = VIEW_META[v].icon;
        const unread = v === "inbox" ? counts?.unread.inbox : v === "spam" ? counts?.unread.spam : undefined;
        return (
          <Tooltip key={v} content={VIEW_META[v].label} side="right">
            <Link
              href={href}
              aria-label={VIEW_META[v].label}
              aria-current={active ? "page" : undefined}
              className={cn("relative flex size-10 items-center justify-center rounded-md", active ? "bg-active text-ink" : "text-ink-subtle hover:bg-hover hover:text-ink")}
            >
              <Icon className="size-[18px]" />
              {unread ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent" aria-hidden /> : null}
            </Link>
          </Tooltip>
        );
      })}
      <div className="flex-1" />
      <Tooltip content="Settings" side="right">
        <Link href="/app/settings" aria-label="Settings" className="flex size-10 items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink">
          <Settings className="size-[18px]" />
        </Link>
      </Tooltip>
    </nav>
  );
}
