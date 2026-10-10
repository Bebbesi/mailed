"use client";

import { Checkbox as C } from "radix-ui";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export function Checkbox({
  checked,
  onCheckedChange,
  className,
  ...props
}: {
  checked: boolean | "indeterminate";
  onCheckedChange: (v: boolean) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  onClick?: (e: React.MouseEvent) => void;
}) {
  return (
    <C.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v === true)}
      className={cn(
        "peer inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-line-strong bg-surface transition-colors",
        "hover:border-ink-faint data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <C.Indicator className="text-white">
        {checked === "indeterminate" ? <Minus className="size-3" strokeWidth={3} /> : <Check className="size-3" strokeWidth={3} />}
      </C.Indicator>
    </C.Root>
  );
}
