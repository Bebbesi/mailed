"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { useApp } from "@/components/mail/app-context";
import { api, errorMessage } from "@/lib/client/api";
import { qk, useCounts, useLabels } from "@/lib/client/hooks";
import { LABEL_DOT } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import { Section } from "./section";

export function LabelsSettings() {
  const { labels: initial, openLabelDialog } = useApp();
  const { data: labels = initial } = useLabels(initial);
  const { data: counts } = useCounts();
  const qc = useQueryClient();
  const confirm = useConfirm();
  return (
    <Section title="Labels" description="Labels work like folders, but a conversation can have several. They appear in the sidebar.">
      <div>
        <Button size="sm" onClick={() => openLabelDialog()}>
          <Plus className="size-3.5" /> New label
        </Button>
      </div>
      {labels.length === 0 ? (
        <EmptyState className="rounded-lg border border-dashed border-line py-10" icon={<Tag />} title="No labels yet" description="Create labels such as Clients, Travel or Receipts." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {labels.map((l) => (
            <li key={l.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
              <span className={cn("size-2.5 rounded-full", LABEL_DOT[l.color])} aria-hidden />
              <span className="flex-1 truncate text-[13px] font-medium">{l.name}</span>
              <span className="text-xs text-ink-subtle">
                {counts?.labels[l.id]?.total ?? 0} conversations{counts?.labels[l.id]?.unread ? ` · ${counts.labels[l.id].unread} unread` : ""}
              </span>
              <IconButton label={`Edit ${l.name}`} icon={<Pencil />} onClick={() => openLabelDialog(l)} />
              <IconButton
                label={`Delete ${l.name}`}
                icon={<Trash2 />}
                onClick={async () => {
                  if (!(await confirm({ title: `Delete label “${l.name}”?`, description: "Conversations keep existing; only the label is removed.", confirmLabel: "Delete", destructive: true }))) return;
                  try {
                    await api(`/api/labels/${l.id}`, { method: "DELETE" });
                    void qc.invalidateQueries({ queryKey: qk.labels });
                    toast("Label deleted");
                  } catch (err) {
                    toast.error(errorMessage(err));
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
