"use client";

import { Popover as P } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;
export const PopoverAnchor = P.Anchor;

export function PopoverContent({
  children,
  className,
  align = "start",
  side = "bottom",
  sideOffset = 6,
  onOpenAutoFocus,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  sideOffset?: number;
  onOpenAutoFocus?: (e: Event) => void;
  "aria-label"?: string;
}) {
  return (
    <P.Portal>
      <P.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={8}
        onOpenAutoFocus={onOpenAutoFocus}
        aria-label={ariaLabel}
        className={cn("z-50 rounded-lg border border-line bg-surface p-3 text-[13px] text-ink shadow-lg animate-pop-in focus:outline-none", className)}
      >
        {children}
      </P.Content>
    </P.Portal>
  );
}
