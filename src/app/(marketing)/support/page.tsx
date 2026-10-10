import type { Metadata } from "next";
import Link from "next/link";
import { ProsePage } from "@/components/marketing/prose";

export const metadata: Metadata = { title: "Support" };

const faqs = [
  {
    q: "I forgot my password.",
    a: (
      <>
        Use <Link href="/forgot-password">Reset password</Link>. We send a link to the recovery email you confirmed when you signed up. The
        link works once and expires after an hour.
      </>
    ),
  },
  {
    q: "A message went to Spam by mistake.",
    a: "Open it and choose Not spam. Mailed moves it back and learns from the correction. To always trust a sender, add them under Settings → Filters & senders.",
  },
  {
    q: "Why are images hidden?",
    a: "Remote images can tell the sender when you opened a message. Choose Show images on a message to load them, or change the default in Settings → General.",
  },
  {
    q: "Can I unsend a message?",
    a: "Yes, for a few seconds after sending. Click Undo in the confirmation. You can change the delay in Settings → General.",
  },
  {
    q: "How do I search more precisely?",
    a: "Use operators such as from:, to:, subject:, has:attachment, is:unread, in:archive, label:, after:2026/01/31 and before:. Put exact phrases in quotes.",
  },
  {
    q: "How do I export or delete my data?",
    a: "Settings → Data lets you download your account data and all messages. Settings → Account lets you delete your account permanently.",
  },
];

export default function SupportPage() {
  return (
    <ProsePage title="Support" intro="Answers to common questions. If you run this Mailed installation yourself, see the README and docs/EMAIL_PROVIDER.md in the repository for setup help.">
      {faqs.map((f) => (
        <section key={f.q}>
          <h2>{f.q}</h2>
          <p>{f.a}</p>
        </section>
      ))}
      <section>
        <h2>Keyboard shortcuts</h2>
        <p>Press ? anywhere in your inbox to see all shortcuts.</p>
      </section>
    </ProsePage>
  );
}
