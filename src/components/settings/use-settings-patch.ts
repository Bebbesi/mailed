"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client/api";
import { qk } from "@/lib/client/hooks";
import type { SettingsDTO } from "@/lib/types";

/** Optimistically updates settings and persists them. */
export function useSettingsPatch() {
  const qc = useQueryClient();
  return useCallback(
    async (patch: Partial<SettingsDTO>, opts: { quiet?: boolean } = {}) => {
      const prev = qc.getQueryData<SettingsDTO>(qk.settings);
      if (prev) qc.setQueryData<SettingsDTO>(qk.settings, { ...prev, ...patch });
      try {
        const saved = await api<SettingsDTO>("/api/settings", { method: "PATCH", body: patch });
        qc.setQueryData(qk.settings, saved);
        void qc.invalidateQueries({ queryKey: ["threads"] });
        void qc.invalidateQueries({ queryKey: qk.counts });
        if (!opts.quiet) toast("Settings saved");
        return saved;
      } catch (err) {
        if (prev) qc.setQueryData(qk.settings, prev);
        toast.error(errorMessage(err));
        throw err;
      }
    },
    [qc],
  );
}
