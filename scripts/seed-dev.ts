/**
 * Development-only sample data. Creates two demo accounts and delivers a set
 * of fictional messages through the real ingestion pipeline (parsing,
 * classification, threading), so the UI can be explored locally.
 *
 *   npm run seed:dev
 *
 * Refuses to run when NODE_ENV=production.
 */
import MailComposer from "nodemailer/lib/mail-composer";

if (process.env.NODE_ENV === "production") {
  console.error("seed:dev must not run in production.");
  process.exit(1);
}

type Sample = {
  from: string;
  to?: string;
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
  hoursAgo: number;
  attachments?: { filename: string; content: string; contentType: string }[];
  inReplyTo?: string;
  messageId?: string;
};

async function build(s: Sample, to: string) {
  const composer = new MailComposer({
    from: s.from,
    to: s.to ?? to,
    subject: s.subject,
    text: s.text,
    html: s.html,
    date: new Date(Date.now() - s.hoursAgo * 3600_000),
    messageId: s.messageId ? `<${s.messageId}>` : undefined,
    inReplyTo: s.inReplyTo ? `<${s.inReplyTo}>` : undefined,
    references: s.inReplyTo ? `<${s.inReplyTo}>` : undefined,
    headers: s.headers,
    attachments: (s.attachments ?? []).map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType })),
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return composer.compile().build();
}

async function main() {
  const { db, closeDb } = await import("../src/lib/db");
  const { users } = await import("../src/lib/db/schema");
  const { registerUser } = await import("../src/lib/services/auth");
  const { ingestRawMessage } = await import("../src/lib/mail/ingest");
  const { primaryDomain } = await import("../src/lib/env");
  const { eq } = await import("drizzle-orm");
  const domain = primaryDomain();

  const ensure = async (username: string, first: string, last: string, recovery: string) => {
    const address = `${username}@${domain}`;
    const [existing] = await db.select().from(users).where(eq(users.address, address)).limit(1);
    if (existing) return existing;
    const { user } = await registerUser({ username, firstName: first, lastName: last, recoveryEmail: recovery, password: "demo-password-123" });
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
    return user;
  };

  const alice = await ensure("alice", "Alice", "Rossi", "alice.rossi@example.org");
  await ensure("bob", "Bob", "Bianchi", "bob.bianchi@example.org");

  const samples: Sample[] = [
    {
      from: "Giulia Ferri <giulia@studio-ferri.example>",
      subject: "Q3 planning notes",
      messageId: "q3-planning-1@studio-ferri.example",
      text: "Hi Alice,\n\nI've attached the revised timeline. The main change is moving the beta to the second week of November so we have time for the accessibility review.\n\nCould you check the dependencies on page 2 before Friday?\n\nThanks,\nGiulia",
      attachments: [{ filename: "Timeline-Q3-v4.txt", content: "Week 1: kickoff\nWeek 4: beta\nWeek 6: accessibility review\n", contentType: "text/plain" }],
      hoursAgo: 2,
    },
    {
      from: "Marco Bellini <marco.bellini@northfield.example>",
      subject: "Site visit on Thursday",
      messageId: "visit-1@northfield.example",
      text: "Hi Alice,\n\nWould Thursday at 9 work for the site visit? I'll bring the floor plans.\n\nMarco",
      hoursAgo: 30,
    },
    {
      from: "Marco Bellini <marco.bellini@northfield.example>",
      subject: "Re: Site visit on Thursday",
      inReplyTo: "visit-1@northfield.example",
      text: "Quick follow-up: the parking entrance is on Via Roma, not the main street.\n\nMarco",
      hoursAgo: 4,
    },
    {
      from: "Northwind Billing <billing@northwind-energy.example>",
      subject: "Your September invoice is ready",
      headers: { "Auto-Submitted": "auto-generated" },
      html: "<p>Hello Alice,</p><p>Your invoice <strong>NW-20931</strong> for September is ready. Amount due: <strong>€84.20</strong>, payable by October 15.</p><p>You can view your receipt and payment history in your account.</p><p>Northwind Energy</p>",
      hoursAgo: 20,
    },
    {
      from: "Parcelpoint <no-reply@parcelpoint.example>",
      subject: "Your order #48213 has shipped",
      text: "Good news! Your order #48213 has shipped and is out for delivery tomorrow. Tracking number: PP-77812-IT.",
      hoursAgo: 26,
    },
    {
      from: "Atlas Design Weekly <newsletter@atlasdesign.example>",
      subject: "Issue 214: Type systems that scale",
      headers: { "List-Unsubscribe": "<https://atlasdesign.example/unsubscribe?u=demo>", "List-Id": "Atlas Design Weekly <weekly.atlasdesign.example>", Precedence: "bulk" },
      html: "<h2>Type systems that scale</h2><p>This week: variable fonts in production, spacing tokens, and how three teams rebuilt their design systems.</p><p><a href=\"https://atlasdesign.example/214\">Read the issue</a></p><p style=\"font-size:12px;color:#777\">You are receiving this newsletter because you subscribed. <a href=\"https://atlasdesign.example/unsubscribe\">Unsubscribe</a></p>",
      hoursAgo: 50,
    },
    {
      from: "Lumen Outfitters <offers@lumen-outfitters.example>",
      subject: "Autumn sale: 30% off outerwear this weekend",
      headers: { "List-Unsubscribe": "<mailto:unsubscribe@lumen-outfitters.example>", "X-Campaign": "autumn-sale" },
      html: "<div style=\"text-align:center\"><h1>Autumn sale</h1><p>30% off all outerwear. Free shipping on orders over €50. Limited time only.</p><p><a href=\"https://lumen-outfitters.example/sale\">Shop now</a></p><p><small>Unsubscribe from marketing emails</small></p></div>",
      hoursAgo: 8,
    },
    {
      from: "Brightline Media <promo@brightline-media.example>",
      subject: "[ADV] Win a weekend in Lisbon with our partner airline",
      headers: { "List-Unsubscribe": "<https://brightline-media.example/u>" },
      html: "<p>Sponsored content. Messaggio pubblicitario.</p><p>Book through our partner and enter the draw. <a href=\"https://ad.doubleclick.net/clk;123;456\">Learn more</a></p><p>Unsubscribe</p>",
      hoursAgo: 12,
    },
    {
      from: "Circlespace <notifications@circlespace.example>",
      subject: "Davide Conti mentioned you in a comment",
      text: "Davide Conti mentioned you in a comment: \"@alice what do you think about the new layout?\"\n\nView the conversation on Circlespace.",
      headers: { "List-Unsubscribe": "<https://circlespace.example/settings/notifications>" },
      hoursAgo: 6,
    },
    {
      from: "Open Mapping Group <maps-discuss@lists.openmapping.example>",
      subject: "[maps-discuss] Proposal: new tagging scheme for footpaths",
      headers: { "List-Id": "Open Mapping discussion <maps-discuss.lists.openmapping.example>", "List-Post": "<mailto:maps-discuss@lists.openmapping.example>", Precedence: "list" },
      text: "Hi all,\n\nI'd like to propose a simplified tagging scheme for footpaths. Draft attached in the wiki. Feedback welcome until the end of the month.\n\nSara",
      hoursAgo: 40,
    },
    {
      from: "\"PayPal Security\" <security-alert@paypa1-verify.example>",
      subject: "Your account has been suspended",
      html: "<p>Dear customer,</p><p>We detected unusual sign-in activity. Your account has been suspended. Verify your account within 24 hours to restore access.</p><p><a href=\"http://192.0.2.14/login\">https://www.paypal.com/signin</a></p>",
      hoursAgo: 3,
    },
    {
      from: "Lottery Office <claims@prize-desk.example>",
      subject: "CONGRATULATIONS!!! YOU HAVE WON €1,000,000",
      text: "Congratulations, you have won the international lottery jackpot. To claim your prize send a wire transfer of €200 processing fee via Western Union. Contact our agent immediately.",
      hoursAgo: 15,
    },
  ];

  let delivered = 0;
  for (const s of samples) {
    const raw = await build(s, alice.address);
    const res = await ingestRawMessage(raw, {
      source: "local",
      envelope: { rcptTo: [alice.address] },
      receivedAt: new Date(Date.now() - s.hoursAgo * 3600_000),
    });
    delivered += res.delivered.filter((d) => !d.duplicate).length;
  }
  console.log(`Seeded ${delivered} new sample messages for ${alice.address} (password: demo-password-123).`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
