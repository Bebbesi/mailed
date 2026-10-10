"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";

const groups: { title: string; items: [string, string[]][] }[] = [
  {
    title: "Navigation",
    items: [
      ["Search", ["/"]],
      ["Next / previous conversation", ["j", "k"]],
      ["Open conversation", ["Enter"]],
      ["Back to list", ["u"]],
      ["Go to Inbox", ["g", "i"]],
      ["Go to Starred", ["g", "s"]],
      ["Go to Sent", ["g", "t"]],
      ["Go to Drafts", ["g", "d"]],
    ],
  },
  {
    title: "Actions",
    items: [
      ["Compose", ["c"]],
      ["Reply", ["r"]],
      ["Reply all", ["a"]],
      ["Forward", ["f"]],
      ["Archive", ["e"]],
      ["Move to Trash", ["#"]],
      ["Report spam", ["!"]],
      ["Star / unstar", ["s"]],
      ["Select conversation", ["x"]],
      ["Mark as read", ["Shift", "i"]],
      ["Mark as unread", ["Shift", "u"]],
      ["Snooze", ["b"]],
    ],
  },
  {
    title: "Composer",
    items: [
      ["Send", ["Ctrl", "Enter"]],
      ["Close", ["Esc"]],
      ["Bold / Italic / Underline", ["Ctrl", "B / I / U"]],
    ],
  },
];

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Keyboard shortcuts" className="max-w-2xl">
        <div className="grid gap-8 pb-4 sm:grid-cols-2">
          {groups.map((g) => (
            <section key={g.title} className={g.title === "Actions" ? "sm:row-span-2" : undefined}>
              <h3 className="mb-2 text-[11px] font-medium tracking-wide text-ink-subtle uppercase">{g.title}</h3>
              <dl className="space-y-1.5">
                {g.items.map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-4 text-[13px]">
                    <dt className="text-ink-muted">{label}</dt>
                    <dd className="flex gap-1">
                      {keys.map((k) => (
                        <Kbd key={k}>{k}</Kbd>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
