import {
  Archive,
  Clock,
  File,
  Inbox,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Reply,
  Search,
  Send,
  ShieldAlert,
  Star,
  Tag,
  Trash2,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

const rows = [
  { from: "Giulia Ferri", subject: "Q3 planning notes", snippet: "Attached the revised timeline — the main change is moving the beta to…", time: "10:42", unread: true, active: true, attachment: true },
  { from: "Marco Bellini", subject: "Re: Site visit on Thursday", snippet: "Thursday at 9 works. I'll bring the floor plans and the updated…", time: "09:15", unread: true },
  { from: "Northwind Billing", subject: "Your September invoice is ready", snippet: "Invoice NW-20931 · Amount due on October 15", time: "Oct 8", tag: "Updates" },
  { from: "Elena, me", count: 3, subject: "Workshop agenda", snippet: "Perfect, let's keep the afternoon session short and leave time…", time: "Oct 7", starred: true },
  { from: "Atlas Design Weekly", subject: "Issue 214: Type systems that scale", snippet: "This week: variable fonts in production, spacing tokens and…", time: "Oct 6", tag: "Forums" },
  { from: "Paolo Greco", subject: "Contract draft for review", snippet: "Here is the first draft. Section 4 still needs input from legal…", time: "Oct 5", attachment: true },
];

const nav = [
  { icon: Inbox, label: "Inbox", count: 2, active: true },
  { icon: Star, label: "Starred" },
  { icon: Clock, label: "Snoozed" },
  { icon: Send, label: "Sent" },
  { icon: File, label: "Drafts", count: 1 },
  { icon: Archive, label: "Archive" },
  { icon: ShieldAlert, label: "Spam" },
  { icon: Trash2, label: "Trash" },
];

/**
 * Static illustration of the app built from the same design tokens.
 * Names and messages are fictional sample content.
 */
export function ProductPreview() {
  return (
    <figure aria-label="Product preview with sample messages" className="relative">
      <div className="overflow-hidden rounded-xl border border-line-strong bg-surface shadow-lg">
        <div className="flex h-9 items-center gap-1.5 border-b border-line bg-sidebar px-3" aria-hidden>
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="size-2.5 rounded-full bg-line-strong" />
        </div>
        <div className="flex h-[440px] text-left sm:h-[480px]" aria-hidden>
          <aside className="hidden w-48 shrink-0 flex-col border-r border-line bg-sidebar p-3 md:flex">
            <div className="mb-4 flex items-center gap-2 px-1">
              <LogoMark className="size-5" />
              <span className="text-[13px] font-semibold tracking-tight">Mailed</span>
            </div>
            <div className="mb-3 flex h-8 items-center gap-2 rounded-md bg-accent px-3 text-[12px] font-medium text-accent-fg">
              <Pencil className="size-3.5" />
              Compose
            </div>
            {nav.map((n) => (
              <div
                key={n.label}
                className={cn(
                  "flex h-7 items-center gap-2.5 rounded-md px-2 text-[12px]",
                  n.active ? "bg-active font-medium text-ink" : "text-ink-muted",
                )}
              >
                <n.icon className="size-3.5" />
                <span className="flex-1">{n.label}</span>
                {n.count ? <span className="text-[11px] text-ink-subtle">{n.count}</span> : null}
              </div>
            ))}
            <div className="mt-4 mb-1 px-2 text-[10px] font-medium tracking-wide text-ink-subtle uppercase">Labels</div>
            {[
              ["Clients", "bg-[#2f6fdb]"],
              ["Travel", "bg-[#1f9d8a]"],
              ["Finance", "bg-[#c2410c]"],
            ].map(([l, c]) => (
              <div key={l} className="flex h-7 items-center gap-2.5 px-2 text-[12px] text-ink-muted">
                <span className={cn("size-2 rounded-full", c)} />
                {l}
              </div>
            ))}
          </aside>
          <section className="flex min-w-0 flex-1 flex-col border-r border-line lg:max-w-[440px]">
            <div className="flex h-11 items-center gap-2 border-b border-line px-3">
              <div className="flex h-7 flex-1 items-center gap-2 rounded-md bg-hover px-2.5 text-[12px] text-ink-subtle">
                <Search className="size-3.5" />
                Search mail
              </div>
            </div>
            <div className="flex h-9 items-center gap-4 border-b border-line px-3 text-[12px]">
              <span className="border-b-2 border-ink pb-2 pt-2.5 font-medium">Primary</span>
              <span className="text-ink-subtle">Updates</span>
              <span className="text-ink-subtle">Promotions</span>
              <span className="hidden text-ink-subtle sm:inline">Social</span>
            </div>
            <ul className="flex-1 overflow-hidden">
              {rows.map((r) => (
                <li
                  key={r.subject}
                  className={cn(
                    "border-b border-line px-3 py-2.5",
                    r.active && "bg-selected",
                  )}
                >
                  <div className="flex items-center gap-2 text-[12px]">
                    <Star className={cn("size-3.5 shrink-0", r.starred ? "fill-[#e8a317] text-[#e8a317]" : "text-ink-subtle")} />
                    <span className={cn("w-28 truncate", r.unread ? "font-semibold text-ink" : "text-ink-muted")}>
                      {r.from}
                      {r.count ? <span className="ml-1 font-normal text-ink-subtle">{r.count}</span> : null}
                    </span>
                    <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-subtle">
                      {r.attachment ? <Paperclip className="size-3" /> : null}
                      <span className={r.unread ? "font-semibold text-ink" : undefined}>{r.time}</span>
                    </span>
                  </div>
                  <div className="mt-0.5 truncate pl-5.5 text-[12px]">
                    {r.tag ? <span className="mr-1.5 rounded border border-line px-1 text-[10px] text-ink-subtle">{r.tag}</span> : null}
                    <span className={r.unread ? "font-semibold text-ink" : "text-ink-muted"}>{r.subject}</span>
                    <span className="text-ink-subtle"> — {r.snippet}</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="hidden min-w-0 flex-1 flex-col lg:flex">
            <div className="flex h-11 items-center gap-1 border-b border-line px-3 text-ink-subtle">
              {[Archive, ShieldAlert, Trash2, Clock, Tag, MoreHorizontal].map((I, i) => (
                <span key={i} className="flex size-7 items-center justify-center rounded-md">
                  <I className="size-3.5" />
                </span>
              ))}
            </div>
            <div className="flex-1 overflow-hidden px-6 py-5">
              <h3 className="text-[17px] font-semibold tracking-tight">Q3 planning notes</h3>
              <div className="mt-4 flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-[#dbe4ff] text-[11px] font-medium text-[#1e3a8a] dark:bg-[#1e2a4a] dark:text-[#a5b8f3]">
                  GF
                </span>
                <div className="min-w-0 flex-1 text-[12px]">
                  <div>
                    <span className="font-semibold">Giulia Ferri</span>{" "}
                    <span className="text-ink-subtle">&lt;giulia@studio-ferri.example&gt;</span>
                  </div>
                  <div className="text-ink-subtle">to me, Marco</div>
                </div>
                <span className="text-[11px] text-ink-subtle">10:42</span>
              </div>
              <div className="mt-5 space-y-3 text-[13px] leading-relaxed text-ink-muted">
                <p>Hi both,</p>
                <p>
                  I&apos;ve attached the revised timeline. The main change is moving the beta to the second week of November so we
                  have time for the accessibility review.
                </p>
                <p>Could you check the dependencies on page 2 before Friday?</p>
                <p>Thanks,<br />Giulia</p>
              </div>
              <div className="mt-5 inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-[12px]">
                <File className="size-3.5 text-ink-subtle" />
                <span className="font-medium">Timeline-Q3-v4.pdf</span>
                <span className="text-ink-subtle">248 KB</span>
              </div>
              <div className="mt-6 flex gap-2">
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[12px] font-medium">
                  <Reply className="size-3.5" /> Reply
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong px-3 text-[12px] font-medium">
                  Forward
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-xs text-ink-subtle">Interface preview. Names and messages are sample content.</figcaption>
    </figure>
  );
}
