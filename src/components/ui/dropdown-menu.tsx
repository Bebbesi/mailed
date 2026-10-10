"use client";

import { DropdownMenu as M } from "radix-ui";
import { Check, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuSub = M.Sub;
export const DropdownMenuGroup = M.Group;

const content =
  "z-50 min-w-48 overflow-hidden rounded-lg border border-line bg-surface p-1 text-[13px] text-ink shadow-lg animate-pop-in";

export function DropdownMenuContent({
  children,
  align = "start",
  className,
  sideOffset = 6,
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  sideOffset?: number;
}) {
  return (
    <M.Portal>
      <M.Content align={align} sideOffset={sideOffset} collisionPadding={8} className={cn(content, className)}>
        {children}
      </M.Content>
    </M.Portal>
  );
}

const item =
  "relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-md px-2 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-hover [&_svg]:size-4 [&_svg]:text-ink-subtle";

export function DropdownMenuItem({
  children,
  onSelect,
  icon,
  shortcut,
  destructive,
  disabled,
  className,
}: {
  children: ReactNode;
  onSelect?: (e: Event) => void;
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <M.Item
      onSelect={onSelect}
      disabled={disabled}
      className={cn(item, destructive && "text-danger [&_svg]:text-danger", className)}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="font-mono text-[11px] text-ink-subtle">{shortcut}</span> : null}
    </M.Item>
  );
}

export function DropdownMenuCheckboxItem({
  children,
  checked,
  onCheckedChange,
}: {
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <M.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(e) => e.preventDefault()}
      className={cn(item, "pl-8")}
    >
      <M.ItemIndicator className="absolute left-2 inline-flex">
        <Check className="text-accent-ink!" />
      </M.ItemIndicator>
      <span className="flex-1 truncate">{children}</span>
    </M.CheckboxItem>
  );
}

export function DropdownMenuSubTrigger({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <M.SubTrigger className={cn(item, "data-[state=open]:bg-hover")}>
      {icon}
      <span className="flex-1">{children}</span>
      <ChevronRight className="size-3.5!" />
    </M.SubTrigger>
  );
}

export function DropdownMenuSubContent({ children }: { children: ReactNode }) {
  return (
    <M.Portal>
      <M.SubContent sideOffset={4} collisionPadding={8} className={content}>
        {children}
      </M.SubContent>
    </M.Portal>
  );
}

export function DropdownMenuSeparator() {
  return <M.Separator className="-mx-1 my-1 h-px bg-line" />;
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2 pt-1.5 pb-1 text-[11px] font-medium tracking-wide text-ink-subtle uppercase">{children}</M.Label>;
}
