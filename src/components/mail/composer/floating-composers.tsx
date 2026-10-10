"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import type { ComposeRequest } from "../app-context";
import { Composer } from "./composer";

export type FloatingEntry = { key: string; request: ComposeRequest; minimized: boolean };

export function FloatingComposers({
  entries,
  onClose,
  onToggleMinimize,
}: {
  entries: FloatingEntry[];
  onClose: (key: string) => void;
  onToggleMinimize: (key: string) => void;
}) {
  const router = useRouter();
  if (entries.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-row-reverse items-end gap-3 sm:right-4 sm:left-auto">
      {entries.map((e, i) => (
        <section
          key={e.key}
          aria-label={e.minimized ? "Minimised message" : "New message"}
          className={cn(
            "pointer-events-auto flex flex-col border border-line-strong bg-surface shadow-lg",
            e.minimized
              ? "w-64 rounded-t-lg"
              : "fixed inset-0 rounded-none sm:static sm:h-[min(600px,calc(100dvh-5rem))] sm:w-[min(560px,calc(100vw-2rem))] sm:resize sm:overflow-hidden sm:rounded-t-lg",
            i > 0 && !e.minimized && "hidden xl:flex",
          )}
          style={e.minimized ? undefined : { minWidth: 360, minHeight: 360, maxWidth: "calc(100vw - 2rem)", maxHeight: "calc(100dvh - 4rem)" }}
        >
          <Composer
            request={e.request}
            variant="floating"
            minimized={e.minimized}
            onMinimize={() => onToggleMinimize(e.key)}
            onClose={() => onClose(e.key)}
            onExpand={(draftId) => {
              onClose(e.key);
              router.push(`/app/compose/${draftId}`);
            }}
          />
        </section>
      ))}
    </div>
  );
}
