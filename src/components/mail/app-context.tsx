"use client";

import { createContext, useContext } from "react";
import type { LabelDTO, MeDTO, SettingsDTO } from "@/lib/types";

export type ComposeRequest = {
  mode?: "new" | "reply" | "reply_all" | "forward";
  sourceMessageId?: string;
  draftId?: string;
  to?: { name: string; address: string }[];
};

export type AppContextValue = {
  me: MeDTO;
  settings: SettingsDTO;
  labels: LabelDTO[];
  prefs: { locale: string; timeZone: string };
  openCompose: (req?: ComposeRequest) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  openShortcuts: () => void;
  openLabelDialog: (label?: LabelDTO) => void;
};

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppShell");
  return ctx;
}
