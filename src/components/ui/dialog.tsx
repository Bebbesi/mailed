"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  footer,
  hideClose,
  onOpenAutoFocus,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  footer?: ReactNode;
  hideClose?: boolean;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
      <D.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-lg border border-line bg-surface shadow-lg animate-pop-in focus:outline-none",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0 space-y-1">
            <D.Title className="text-[15px] font-semibold tracking-tight text-ink">{title}</D.Title>
            {description ? <D.Description className="text-[13px] leading-relaxed text-ink-subtle">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>}
          </div>
          {hideClose ? null : (
            <D.Close
              aria-label="Close"
              className="-mt-1 -mr-1 inline-flex size-8 items-center justify-center rounded-md text-ink-subtle hover:bg-hover hover:text-ink"
            >
              <X className="size-4" />
            </D.Close>
          )}
        </div>
        {children ? <div className="min-h-0 overflow-y-auto px-5 pt-4 pb-1 scrollbar-thin">{children}</div> : null}
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 px-5 pt-4 pb-5">{footer}</div> : <div className="h-5" />}
      </D.Content>
    </D.Portal>
  );
}
