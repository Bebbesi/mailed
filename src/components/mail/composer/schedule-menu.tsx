"use client";

import { CalendarClock, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toLocalInputValue } from "@/lib/client/format";

function at(daysFromNow: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, 0, 0, 0);
  return d;
}

function nextMonday(hour: number) {
  const d = new Date();
  const add = ((8 - d.getDay()) % 7) || 7;
  d.setDate(d.getDate() + add);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function quickTimes() {
  return [
    { label: "Tomorrow morning", date: at(1, 8) },
    { label: "Tomorrow afternoon", date: at(1, 13) },
    { label: "Monday morning", date: nextMonday(8) },
  ];
}

export function DateTimeDialog({
  open,
  onOpenChange,
  title,
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  confirmLabel: string;
  onConfirm: (d: Date) => void;
}) {
  const [value, setValue] = useState(() => toLocalInputValue(at(1, 8)));
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={title}
        footer={
          <>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const d = new Date(value);
                if (Number.isNaN(d.getTime()) || d.getTime() < Date.now() + 60_000) {
                  setError("Choose a time at least a minute from now.");
                  return;
                }
                onConfirm(d);
                onOpenChange(false);
              }}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <Field id="datetime" label="Date and time" error={error ?? undefined} hint="Uses your device's time zone.">
          <Input
            id="datetime"
            type="datetime-local"
            value={value}
            min={toLocalInputValue(new Date())}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
          />
        </Field>
      </DialogContent>
    </Dialog>
  );
}

export function ScheduleMenu({ onSchedule, disabled, fmt }: { onSchedule: (d: Date) => void; disabled?: boolean; fmt: (d: Date) => string }) {
  const [custom, setCustom] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="primary" size="sm" className="rounded-l-none border-l border-white/20 px-1.5" aria-label="More send options" disabled={disabled}>
            <ChevronDown className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Schedule send</DropdownMenuLabel>
          {quickTimes().map((t) => (
            <DropdownMenuItem key={t.label} icon={<CalendarClock />} onSelect={() => onSchedule(t.date)}>
              <span className="flex w-full justify-between gap-3">
                <span>{t.label}</span>
                <span className="text-ink-subtle">{fmt(t.date)}</span>
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem icon={<CalendarClock />} onSelect={() => setCustom(true)}>
            Pick date and time…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DateTimeDialog open={custom} onOpenChange={setCustom} title="Schedule send" confirmLabel="Schedule" onConfirm={onSchedule} />
    </>
  );
}
