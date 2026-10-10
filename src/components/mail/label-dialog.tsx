"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { qk } from "@/lib/client/hooks";
import { LABEL_DOT } from "@/lib/client/views";
import { cn } from "@/lib/cn";
import { LABEL_COLORS, type LabelDTO } from "@/lib/types";

export function LabelDialog({
  open,
  onOpenChange,
  label,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  label?: LabelDTO | null;
  onCreated?: (label: LabelDTO) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(label?.name ?? "");
  const [color, setColor] = useState<string>(label?.color ?? "blue");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Enter a name.");
      return;
    }
    setSaving(true);
    try {
      const saved = label
        ? await api<LabelDTO>(`/api/labels/${label.id}`, { method: "PATCH", body: { name, color } })
        : await api<LabelDTO>("/api/labels", { body: { name, color } });
      await qc.invalidateQueries({ queryKey: qk.labels });
      void qc.invalidateQueries({ queryKey: ["threads"] });
      toast(label ? "Label updated" : `Label "${saved.name}" created`);
      onCreated?.(saved);
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={label ? "Edit label" : "New label"}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="label-form" loading={saving}>
              {label ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <form id="label-form" onSubmit={submit} className="space-y-4">
          <Field id="label-name" label="Name" error={error ?? undefined}>
            <Input id="label-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={50} autoFocus aria-invalid={error ? true : undefined} />
          </Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium">Color</legend>
            <div className="flex flex-wrap gap-2">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={c}
                  aria-pressed={color === c}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border border-transparent",
                    color === c && "border-ink-subtle",
                  )}
                >
                  <span className={cn("size-4 rounded-full", LABEL_DOT[c])} />
                </button>
              ))}
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
