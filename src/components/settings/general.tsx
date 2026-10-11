"use client";

import { useMemo } from "react";
import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { applyTheme } from "@/lib/client/theme";
import type { SettingsDTO } from "@/lib/types";
import { Row, Section, Segmented } from "./section";
import { ThemePicker } from "./theme-picker";
import { useSettingsPatch } from "./use-settings-patch";

const LOCALES = [
  ["en-US", "English (United States)"],
  ["en-GB", "English (United Kingdom)"],
  ["it-IT", "Italiano (Italia)"],
  ["de-DE", "Deutsch (Deutschland)"],
  ["fr-FR", "Français (France)"],
  ["es-ES", "Español (España)"],
  ["pt-BR", "Português (Brasil)"],
  ["nl-NL", "Nederlands (Nederland)"],
] as const;

export function GeneralSettings({ settings }: { settings: SettingsDTO }) {
  const patch = useSettingsPatch();
  const zones = useMemo(() => {
    try {
      const list = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf("timeZone");
      return ["UTC", ...list.filter((z) => z !== "UTC"), ...(list.includes(settings.timeZone) || settings.timeZone === "UTC" ? [] : [settings.timeZone])];
    } catch {
      return ["UTC", settings.timeZone];
    }
  }, [settings.timeZone]);
  const localeOptions = LOCALES.some(([v]) => v === settings.locale) ? LOCALES : [...LOCALES, [settings.locale, settings.locale] as const];
  const sample = (() => {
    try {
      return new Intl.DateTimeFormat(settings.locale, { dateStyle: "full", timeStyle: "short", timeZone: settings.timeZone }).format(new Date());
    } catch {
      return "";
    }
  })();

  return (
    <>
      <Section title="Appearance" description="How Mailed looks on this and your other devices.">
        <div>
          <p className="mb-3 text-[13px] font-medium text-ink">Theme</p>
          <ThemePicker
            value={settings.theme}
            onChange={(theme) => {
              applyTheme(theme);
              void patch({ theme }, { quiet: true });
            }}
          />
        </div>
        <Row label="List density" description="Compact shows more conversations at once.">
          <Segmented
            label="List density"
            value={settings.density}
            onChange={(density) => void patch({ density }, { quiet: true })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
        </Row>
      </Section>

      <Section title="Reading" description="How conversations open and display.">
        <Row label="Reading pane" description="Show the open conversation next to the list on large screens.">
          <Segmented
            label="Reading pane"
            value={settings.readingPane}
            onChange={(readingPane) => void patch({ readingPane }, { quiet: true })}
            options={[
              { value: "right", label: "Right of list" },
              { value: "off", label: "Full page" },
            ]}
          />
        </Row>
        <Row htmlFor="mark-read" label="Mark as read when opened">
          <Switch id="mark-read" checked={settings.markReadOnOpen} onCheckedChange={(v) => void patch({ markReadOnOpen: v })} />
        </Row>
        <Row htmlFor="remote-images" label="Remote images" description="Loading images lets senders know when you open a message. Images are never loaded automatically in Spam or in suspicious messages.">
          <Select id="remote-images" value={settings.remoteImages} onChange={(e) => void patch({ remoteImages: e.target.value as SettingsDTO["remoteImages"] })} className="w-48">
            <option value="ask">Ask before showing</option>
            <option value="always">Always show</option>
          </Select>
        </Row>
        <Row htmlFor="categories" label="Inbox categories" description="Show only Primary in the Inbox, with tabs for Social, Promotions, Updates and Forums.">
          <Switch id="categories" checked={settings.inboxCategories} onCheckedChange={(v) => void patch({ inboxCategories: v })} />
        </Row>
        <Row htmlFor="page-size" label="Conversations per page">
          <Select id="page-size" value={String(settings.pageSize)} onChange={(e) => void patch({ pageSize: Number(e.target.value) as 25 | 50 | 100 })} className="w-28">
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </Select>
        </Row>
      </Section>

      <Section title="Sending">
        <Row htmlFor="undo" label="Undo send" description="How long you can take a message back after clicking Send.">
          <Select id="undo" value={String(settings.undoSendSeconds)} onChange={(e) => void patch({ undoSendSeconds: Number(e.target.value) as 0 | 5 | 10 | 20 | 30 })} className="w-36">
            <option value="0">Off</option>
            <option value="5">5 seconds</option>
            <option value="10">10 seconds</option>
            <option value="20">20 seconds</option>
            <option value="30">30 seconds</option>
          </Select>
        </Row>
      </Section>

      <Section title="Language and region" description="Used for dates, times and numbers. The interface itself is in English.">
        <Row htmlFor="locale" label="Format">
          <Select id="locale" value={settings.locale} onChange={(e) => void patch({ locale: e.target.value })} className="w-60">
            {localeOptions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Row>
        <Row htmlFor="tz" label="Time zone">
          <Select id="tz" value={settings.timeZone} onChange={(e) => void patch({ timeZone: e.target.value })} className="w-60">
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, " ")}
              </option>
            ))}
          </Select>
        </Row>
        {sample ? <p className="text-xs text-ink-subtle" suppressHydrationWarning>Preview: {sample}</p> : null}
      </Section>
    </>
  );
}
