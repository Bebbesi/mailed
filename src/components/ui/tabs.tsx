"use client";

import { Tabs as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Tabs = T.Root;
export const TabsContent = T.Content;

export function TabsList({ children, className, "aria-label": label }: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <T.List aria-label={label} className={cn("flex gap-1 border-b border-line", className)}>
      {children}
    </T.List>
  );
}

export function TabsTrigger({ value, children }: { value: string; children: ReactNode }) {
  return (
    <T.Trigger
      value={value}
      className={cn(
        "relative -mb-px inline-flex h-9 items-center gap-2 border-b-2 border-transparent px-2.5 text-[13px] font-medium text-ink-subtle transition-colors",
        "hover:text-ink data-[state=active]:border-ink data-[state=active]:text-ink",
      )}
    >
      {children}
    </T.Trigger>
  );
}
