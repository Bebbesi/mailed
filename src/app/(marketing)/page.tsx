import Link from "next/link";
import {
  ArrowRight,
  BellOff,
  Clock,
  EyeOff,
  FileLock2,
  Filter,
  Fingerprint,
  KeyRound,
  Keyboard,
  Layers,
  LockKeyhole,
  MailCheck,
  RotateCcw,
  Search,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductPreview } from "@/components/marketing/product-preview";

const features = [
  {
    icon: Layers,
    title: "Organised on arrival",
    body: "Every message is sorted into Primary, Updates, Promotions, Social or Forums as it arrives. Move a sender once and Mailed remembers.",
  },
  {
    icon: ShieldCheck,
    title: "Spam and phishing filters",
    body: "A probabilistic filter weighs sender authentication, links, attachments and content, and learns from what you mark as spam or not spam.",
  },
  {
    icon: Search,
    title: "Search that keeps up",
    body: "Full-text search across subjects, senders and bodies, with operators like from:, has:attachment, before: and label: when you need precision.",
  },
  {
    icon: EyeOff,
    title: "Private by default",
    body: "Remote images stay blocked until you choose to load them, so senders can't tell when you open a message.",
  },
];

const details = [
  { icon: Clock, title: "Snooze", body: "Hide a conversation until the moment it matters." },
  { icon: Timer, title: "Scheduled send", body: "Write now, deliver tomorrow morning." },
  { icon: RotateCcw, title: "Undo send", body: "A short window to take a message back." },
  { icon: BellOff, title: "Quiet categories", body: "Mute notifications for Promotions or Social." },
  { icon: Filter, title: "Rules", body: "Label, archive or star mail automatically." },
  { icon: Keyboard, title: "Keyboard first", body: "Triage your inbox without touching the mouse." },
];

const security = [
  { icon: KeyRound, title: "Argon2id password hashing", body: "Passwords are never stored, only salted Argon2id hashes." },
  { icon: Fingerprint, title: "Revocable sessions", body: "See where you are signed in and end any session from settings." },
  { icon: FileLock2, title: "Isolated message rendering", body: "Email HTML is sanitised and displayed in a sandboxed frame without scripts." },
  { icon: LockKeyhole, title: "Private attachments", body: "Files are served through short-lived signed links. Executable files are blocked." },
  { icon: MailCheck, title: "Sender authentication", body: "SPF, DKIM and DMARC results feed the spam filter and warnings." },
  { icon: ShieldCheck, title: "Abuse protection", body: "Rate limits on sign-in, sign-up and sending; CSRF and XSS defences throughout." },
];

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-4xl font-semibold tracking-[-0.035em] text-ink text-balance sm:text-6xl">Your inbox. Under control.</h1>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-subtle text-pretty sm:text-lg">
              Mailed sorts what arrives, filters what shouldn&apos;t, and finds anything in seconds — in a calm interface that stays out of
              your way.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild variant="primary" size="lg" className="w-full sm:w-auto">
                <Link href="/register">
                  Get started
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="secondary" size="lg" className="w-full sm:w-auto">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
          </div>
          <div className="mx-auto mt-14 max-w-5xl sm:mt-16">
            <ProductPreview />
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-16 border-t border-line bg-sidebar">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Less sorting. More doing.</h2>
            <p className="mt-3 text-[15px] leading-relaxed text-ink-subtle">
              The work of managing email happens in the background, so the inbox shows what needs your attention.
            </p>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="bg-surface p-6">
                <f.icon className="size-5 text-accent-ink" aria-hidden />
                <h3 className="mt-4 text-sm font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-ink-subtle">{f.body}</p>
              </div>
            ))}
          </div>
          <ul className="mt-14 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {details.map((d) => (
              <li key={d.title} className="flex gap-3">
                <d.icon className="mt-0.5 size-4 shrink-0 text-ink-subtle" aria-hidden />
                <div>
                  <h3 className="text-[13px] font-semibold text-ink">{d.title}</h3>
                  <p className="mt-0.5 text-[13px] text-ink-subtle">{d.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="security" className="scroll-mt-16 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[1fr_2fr]">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Security in the details</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-subtle">
                Mail is personal. These protections are part of how Mailed is built, not settings you have to find.
              </p>
              <p className="mt-6 text-[13px] text-ink-subtle">
                Read more in our{" "}
                <Link href="/privacy" className="font-medium text-accent-ink hover:underline">
                  privacy policy
                </Link>
                .
              </p>
            </div>
            <ul className="grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {security.map((s) => (
                <li key={s.title} className="flex gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface shadow-xs">
                    <s.icon className="size-4 text-ink-muted" aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-[13px] font-semibold text-ink">{s.title}</h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-subtle">{s.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-sidebar">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-16 sm:flex-row sm:items-center sm:px-6">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-ink">Start with a clean inbox.</h2>
            <p className="mt-1 text-[14px] text-ink-subtle">Create your address in under a minute.</p>
          </div>
          <Button asChild variant="primary" size="lg">
            <Link href="/register">
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
