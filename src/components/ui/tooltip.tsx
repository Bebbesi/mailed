"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <T.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </T.Provider>
  );
}

export function Tooltip({
  content,
  children,
  side = "bottom",
  shortcut,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}) {
  return (
    <T.Root>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-50 flex items-center gap-2 rounded-md bg-ink px-2 py-1 text-xs font-medium text-canvas shadow-md",
            "animate-fade-in select-none",
          )}
        >
          {content}
          {shortcut ? <kbd className="rounded border border-canvas/25 px-1 font-mono text-[10px] text-canvas/80">{shortcut}</kbd> : null}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
