"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Contact, MoreHorizontal, Pencil, Plus, Settings, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Tooltip } from "@/components/ui/tooltip";
import { api, errorMessage } from "@/lib/client/api";
import { formatBytes } from "@/lib/client/format";
import { qk, useCounts, useLabels } from "@/lib/client/hooks";
import { CATEGORY_VIEWS, LABEL_DOT, VIEW_META } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import type { LabelDTO, SystemView } from "@/lib/types";
import { useApp } from "./app-context";

function NavItem({
  href,
  icon: Icon,
  label,
  count,
  countKind = "unread",
  active,
  onNavigate,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  countKind?: "unread" | "total";
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-3 rounded-md px-2.5 text-[13px] transition-colors",
        active ? "bg-active font-medium text-ink" : "text-ink-muted hover:bg-hover hover:text-ink",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-ink" : "text-ink-subtle group-hover:text-ink-muted")} />
      <span className="flex-1 truncate">{label}</span>
      {count ? (
        <span
          className={cn("text-xs tabular-nums", countKind === "unread" && "font-semibold text-ink", countKind === "total" && "text-ink-subtle")}
          aria-label={`${count} ${countKind === "unread" ? "unread" : "items"}`}
        >
          {count > 999 ? "999+" : count}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me, openCompose, openLabelDialog, labels: initialLabels } = useApp();
  const { data: counts } = useCounts();
  const { data: labels = initialLabels } = useLabels(initialLabels);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const confirm = useConfirm();
  const qc = useQueryClient();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const unread = counts?.unread ?? {};
  const totals = counts?.totals ?? {};

  const primary: { view: SystemView; count?: number; kind?: "unread" | "total" }[] = [
    { view: "inbox", count: unread.inbox },
    { view: "starred" },
    { view: "snoozed", count: totals.snoozed, kind: "total" },
    { view: "sent" },
    ...(totals.scheduled ? [{ view: "scheduled" as const, count: totals.scheduled, kind: "total" as const }] : []),
    { view: "drafts", count: totals.drafts, kind: "total" },
    { view: "archive" },
  ];
  const secondary: { view: SystemView; count?: number; kind?: "unread" | "total" }[] = [
    { view: "spam", count: unread.spam },
    { view: "trash" },
  ];

  const deleteLabel = async (label: LabelDTO) => {
    const ok = await confirm({
      title: `Delete label "${label.name}"?`,
      description: "The label is removed from all conversations. The conversations themselves are not deleted.",
      confirmLabel: "Delete label",
      destructive: true,
    });
    if (!ok) return;
    try {
      await api(`/api/labels/${label.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: qk.labels });
      void qc.invalidateQueries({ queryKey: ["threads"] });
      toast("Label deleted");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const used = me.storage.usedBytes;
  const quota = me.storage.quotaBytes;
  const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/app/inbox" onClick={onNavigate} aria-label="Mailed inbox" className="rounded-md">
          <Logo />
        </Link>
      </div>
      <div className="px-3 pb-3">
        <Button
          variant="primary"
          className="w-full justify-start gap-2.5 px-3"
          onClick={() => {
            onNavigate?.();
            openCompose();
          }}
        >
          <Pencil className="size-4" />
          Compose
          <kbd className="ml-auto hidden rounded border border-white/25 px-1 font-mono text-[10px] text-white/80 lg:inline">C</kbd>
        </Button>
      </div>
      <nav aria-label="Mailboxes" className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 pb-3 scrollbar-thin">
        {primary.map((item) => (
          <NavItem
            key={item.view}
            href={`/app/${item.view}`}
            icon={VIEW_META[item.view].icon}
            label={VIEW_META[item.view].label}
            count={item.count}
            countKind={item.kind}
            active={isActive(`/app/${item.view}`)}
            onNavigate={onNavigate}
          />
        ))}

        <button
          type="button"
          onClick={() => setCategoriesOpen((v) => !v)}
          aria-expanded={categoriesOpen}
          className="mt-3 flex h-7 w-full items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium tracking-wide text-ink-subtle uppercase hover:text-ink"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", !categoriesOpen && "-rotate-90")} />
          Categories
        </button>
        {categoriesOpen
          ? CATEGORY_VIEWS.map((v) => (
              <NavItem
                key={v}
                href={`/app/${v}`}
                icon={VIEW_META[v].icon}
                label={VIEW_META[v].label}
                count={unread[v]}
                active={isActive(`/app/${v}`)}
                onNavigate={onNavigate}
              />
            ))
          : null}

        <div className="pt-2" />
        {secondary.map((item) => (
          <NavItem
            key={item.view}
            href={`/app/${item.view}`}
            icon={VIEW_META[item.view].icon}
            label={VIEW_META[item.view].label}
            count={item.count}
            countKind={item.kind}
            active={isActive(`/app/${item.view}`)}
            onNavigate={onNavigate}
          />
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className="flex h-8 w-full items-center gap-3 rounded-md px-2.5 text-[13px] text-ink-muted hover:bg-hover hover:text-ink"
        >
          <ChevronDown className={cn("size-4 text-ink-subtle transition-transform", !moreOpen && "-rotate-90")} />
          {moreOpen ? "Less" : "More"}
        </button>
        {moreOpen
          ? (["important", "all"] as const).map((v) => (
              <NavItem key={v} href={`/app/${v}`} icon={VIEW_META[v].icon} label={VIEW_META[v].label} active={isActive(`/app/${v}`)} onNavigate={onNavigate} />
            ))
          : null}

        <div className="mt-4 flex h-7 items-center justify-between pr-1 pl-2.5">
          <span className="text-[11px] font-medium tracking-wide text-ink-subtle uppercase">Labels</span>
          <Tooltip content="Create label">
            <button
              type="button"
              aria-label="Create label"
              onClick={() => openLabelDialog()}
              className="flex size-6 items-center justify-center rounded text-ink-subtle hover:bg-hover hover:text-ink"
            >
              <Plus className="size-3.5" />
            </button>
          </Tooltip>
        </div>
        {labels.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-ink-subtle">Labels you create appear here.</p>
        ) : (
          labels.map((l) => {
            const href = `/app/label/${l.id}`;
            const c = counts?.labels[l.id];
            return (
              <div key={l.id} className="group relative">
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={isActive(href) ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center gap-3 rounded-md pr-8 pl-2.5 text-[13px]",
                    isActive(href) ? "bg-active font-medium text-ink" : "text-ink-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  <span className={cn("ml-1 size-2 shrink-0 rounded-full", LABEL_DOT[l.color] ?? LABEL_DOT.slate)} aria-hidden />
                  <span className="flex-1 truncate">{l.name}</span>
                  {c?.unread ? <span className="text-xs font-semibold text-ink tabular-nums group-hover:opacity-0">{c.unread}</span> : null}
                </Link>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Options for label ${l.name}`}
                      className="absolute top-1 right-1 flex size-6 items-center justify-center rounded text-ink-subtle opacity-0 group-hover:opacity-100 hover:bg-active hover:text-ink focus-visible:opacity-100 data-[state=open]:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem icon={<Pencil />} onSelect={() => openLabelDialog(l)}>
                      Edit label
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => void deleteLabel(l)}>
                      Delete label
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })
        )}
      </nav>
      <div className="shrink-0 space-y-0.5 border-t border-line p-3">
        <NavItem href="/app/contacts" icon={Contact} label="Contacts" active={isActive("/app/contacts")} onNavigate={onNavigate} />
        <NavItem href="/app/settings" icon={Settings} label="Settings" active={isActive("/app/settings")} onNavigate={onNavigate} />
        <div className="px-2.5 pt-3">
          <div
            className="h-1 overflow-hidden rounded-full bg-line"
            role="progressbar"
            aria-label="Storage used"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={cn("h-full rounded-full", pct > 90 ? "bg-danger" : pct > 75 ? "bg-warn" : "bg-ink-subtle")} style={{ width: `${Math.max(pct, 1)}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] text-ink-subtle">
            {formatBytes(used)} of {formatBytes(quota)} used
          </p>
        </div>
      </div>
    </div>
  );
}
