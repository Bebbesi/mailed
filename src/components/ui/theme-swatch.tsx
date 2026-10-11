import { cn } from "@/lib/cn";
import { themeMode, type ThemeId } from "@/lib/themes";

/** Scopes a palette's CSS variables to one element, so previews show real theme colours. */
function scope(id: ThemeId) {
  return { "data-theme": id, className: themeMode(id) === "dark" ? "dark" : undefined };
}

/** Small round swatch (menu icon): background on one half, accent on the other. */
export function ThemeDot({ id, className }: { id: ThemeId; className?: string }) {
  const s = scope(id);
  return (
    <span
      aria-hidden
      data-theme={s["data-theme"]}
      className={cn(
        s.className,
        "inline-block size-4 shrink-0 rounded-full border border-line-strong bg-[linear-gradient(135deg,var(--sidebar)_50%,var(--accent)_50%)]",
        className,
      )}
    />
  );
}

/** Miniature mailbox drawn with a palette's own tokens. */
export function ThemePreview({ id, className }: { id: ThemeId; className?: string }) {
  const s = scope(id);
  return (
    <div aria-hidden data-theme={s["data-theme"]} className={cn(s.className, "flex h-full overflow-hidden bg-canvas", className)}>
      <div className="w-[28%] space-y-1.5 border-r border-line bg-sidebar p-1.5">
        <div className="h-2 w-full rounded-sm bg-accent" />
        <div className="h-1 w-3/4 rounded-full bg-ink-faint" />
        <div className="h-1 w-2/3 rounded-full bg-line-strong" />
        <div className="h-1 w-3/4 rounded-full bg-line-strong" />
      </div>
      <div className="flex-1 space-y-1.5 bg-surface p-1.5">
        <div className="flex items-center gap-1 rounded-sm bg-selected px-1 py-0.5">
          <span className="size-1 shrink-0 rounded-full bg-accent" />
          <span className="h-1 flex-1 rounded-full bg-ink" />
        </div>
        <div className="flex items-center gap-1 px-1">
          <span className="size-1 shrink-0 rounded-full bg-accent" />
          <span className="h-1 w-4/5 rounded-full bg-ink-muted" />
        </div>
        <div className="flex items-center gap-1 px-1">
          <span className="size-1 shrink-0" />
          <span className="h-1 w-3/5 rounded-full bg-ink-faint" />
        </div>
      </div>
    </div>
  );
}
