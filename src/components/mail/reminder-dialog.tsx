"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/client/api";
import { toLocalInputValue } from "@/lib/client/format";
import { cn } from "@/lib/cn";

function preset(days: number, hour = 9) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function ReminderDialog({
  open,
  onOpenChange,
  messageId,
  threadId,
  outbound,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  messageId: string;
  threadId: string;
  outbound: boolean;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(() => toLocalInputValue(preset(outbound ? 3 : 1)));
  const [onlyIfNoReply, setOnlyIfNoReply] = useState(outbound);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const presets = [
    { label: "Tomorrow", d: preset(1) },
    { label: "In 3 days", d: preset(3) },
    { label: "In a week", d: preset(7) },
  ];

  const save = async () => {
    const d = new Date(value);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) {
      setError("Choose a time in the future.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/reminders", { body: { messageId, remindAt: d.toISOString(), onlyIfNoReply, note } });
      void qc.invalidateQueries({ queryKey: ["thread", threadId] });
      toast("Reminder set");
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
        title="Remind me about this"
        description="The conversation returns to the top of your inbox with a notification."
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Set reminder
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setValue(toLocalInputValue(p.d))}
                className={cn(
                  "h-7 rounded-full border px-3 text-[12px]",
                  value === toLocalInputValue(p.d) ? "border-accent bg-accent-soft text-accent-ink" : "border-line-strong text-ink-muted hover:bg-hover",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Field id="remind-at" label="Date and time" error={error ?? undefined}>
            <Input id="remind-at" type="datetime-local" value={value} min={toLocalInputValue(new Date())} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Field id="remind-note" label="Note (optional)">
            <Input id="remind-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Follow up on the quote" />
          </Field>
          <label className="flex items-start gap-2.5 text-[13px] text-ink-muted">
            <Checkbox checked={onlyIfNoReply} onCheckedChange={setOnlyIfNoReply} className="mt-0.5" />
            <span>Only remind me if nobody has replied by then</span>
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
