"use client";

import { Switch as S } from "radix-ui";
import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <S.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors",
        "bg-line-strong data-[state=checked]:bg-accent disabled:opacity-50",
      )}
    >
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[18px]" />
    </S.Root>
  );
}
