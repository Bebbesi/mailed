"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/mail/app-context";
import { useMe, useSettings } from "@/lib/client/hooks";
import { cn } from "@/lib/cn";
import { AccountSettings } from "./account";
import { DataSettings } from "./data";
import { FiltersSettings } from "./filters";
import { GeneralSettings } from "./general";
import { LabelsSettings } from "./labels";
import { LinkedAccountsSettings } from "./linked-accounts";
import { NotificationSettings } from "./notifications";
import { SecuritySettings } from "./security";
import { SignatureSettings } from "./signature";

const TABS = [
  { id: "general", label: "General" },
  { id: "account", label: "Account" },
  { id: "accounts", label: "Linked accounts" },
  { id: "signature", label: "Sender & signature" },
  { id: "notifications", label: "Notifications" },
  { id: "filters", label: "Filters & senders" },
  { id: "labels", label: "Labels" },
  { id: "security", label: "Security" },
  { id: "data", label: "Data & storage" },
] as const;

export function SettingsPage() {
  const app = useApp();
  const { data: me = app.me } = useMe(app.me);
  const { data: settings = app.settings } = useSettings(app.settings);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? (params.get("tab") as (typeof TABS)[number]["id"]) : "general";

  return (
    <div className="h-full overflow-y-auto bg-surface scrollbar-thin">
      <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-8">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <nav aria-label="Settings sections" className="-mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line px-4 scrollbar-thin sm:mx-0 sm:px-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => router.replace(`${pathname}?tab=${t.id}`, { scroll: false })}
              className={cn(
                "relative -mb-px h-10 shrink-0 border-b-2 px-3 text-[13px] whitespace-nowrap transition-colors",
                tab === t.id ? "border-ink font-medium text-ink" : "border-transparent text-ink-subtle hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="pt-4 pb-16">
          {tab === "general" ? <GeneralSettings settings={settings} /> : null}
          {tab === "account" ? <AccountSettings me={me} /> : null}
          {tab === "accounts" ? <LinkedAccountsSettings /> : null}
          {tab === "signature" ? <SignatureSettings settings={settings} me={me} /> : null}
          {tab === "notifications" ? <NotificationSettings settings={settings} /> : null}
          {tab === "filters" ? <FiltersSettings initialLabels={app.labels} /> : null}
          {tab === "labels" ? <LabelsSettings /> : null}
          {tab === "security" ? <SecuritySettings prefs={app.prefs} /> : null}
          {tab === "data" ? <DataSettings me={me} /> : null}
        </div>
      </div>
    </div>
  );
}
