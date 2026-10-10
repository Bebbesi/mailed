"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import type { SettingsDTO } from "@/lib/types";
import { Row, Section } from "./section";
import { useSettingsPatch } from "./use-settings-patch";

const CATS = [
  ["primary", "Primary"],
  ["social", "Social"],
  ["promotions", "Promotions"],
  ["updates", "Updates"],
  ["forums", "Forums"],
  ["ads", "Ads"],
] as const;

export function NotificationSettings({ settings }: { settings: SettingsDTO }) {
  const patch = useSettingsPatch();
  const browserPermission = useSyncExternalStore(
    () => () => undefined,
    () => (typeof Notification === "undefined" ? "unsupported" : Notification.permission),
    () => "default" as const,
  );
  const [requested, setRequested] = useState<NotificationPermission | null>(null);
  const permission = requested ?? browserPermission;

  const enableBrowser = async (on: boolean) => {
    if (!on) {
      await patch({ notifyBrowser: false });
      return;
    }
    if (permission === "unsupported") return;
    const result = permission === "granted" ? "granted" : await Notification.requestPermission();
    setRequested(result);
    if (result === "granted") await patch({ notifyBrowser: true });
  };

  return (
    <>
      <Section title="Notifications" description="Get told about new mail while Mailed is open.">
        <Row htmlFor="in-app" label="In-app notifications" description="A short notice in the corner when new mail arrives.">
          <Switch id="in-app" checked={settings.notifyInApp} onCheckedChange={(v) => void patch({ notifyInApp: v })} />
        </Row>
        <Row
          htmlFor="browser"
          label="Desktop notifications"
          description={
            permission === "unsupported"
              ? "This browser doesn't support notifications."
              : permission === "denied"
                ? "Notifications are blocked for this site in your browser settings."
                : "Shown by your operating system when Mailed is in a background tab."
          }
        >
          <Switch id="browser" checked={settings.notifyBrowser && permission === "granted"} disabled={permission === "unsupported" || permission === "denied"} onCheckedChange={(v) => void enableBrowser(v)} />
        </Row>
        {settings.notifyBrowser && permission === "granted" ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => new Notification("Mailed", { body: "Desktop notifications are working.", icon: "/icon.svg" })}
          >
            Send a test notification
          </Button>
        ) : null}
      </Section>
      <Section title="Quiet categories" description="Mail in these categories arrives silently.">
        <div className="grid gap-3 sm:grid-cols-2">
          {CATS.map(([value, label]) => {
            const muted = settings.mutedCategories.includes(value);
            return (
              <label key={value} className="flex items-center gap-2.5 text-[13px] text-ink-muted">
                <Checkbox
                  checked={muted}
                  onCheckedChange={(v) =>
                    void patch({ mutedCategories: v ? [...settings.mutedCategories, value] : settings.mutedCategories.filter((c) => c !== value) })
                  }
                />
                Mute {label}
              </label>
            );
          })}
        </div>
      </Section>
    </>
  );
}
