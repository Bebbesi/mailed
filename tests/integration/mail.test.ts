import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { attachments, classifierStats, contacts, jobs, messageRecipients, messages, notifications, reminders, threads } from "@/lib/db/schema";
import { claimJobs, completeJob } from "@/lib/jobs";
import { ingestRawMessage, IngestError } from "@/lib/mail/ingest";
import { setOutboundTransport, TransportError, type OutboundTransport } from "@/lib/mail/transport";
import { resetEnvCache } from "@/lib/env";
import { applyAction, emptyFolder } from "@/lib/services/actions";
import { addDraftAttachment, attachmentDownloadUrl } from "@/lib/services/attachments";
import { cancelSend, createDraft, sendDraft, updateDraft } from "@/lib/services/compose";
import { createLabel } from "@/lib/services/labels";
import { getThread, listThreads, mailboxCounts } from "@/lib/services/mailbox";
import { fireReminders, wakeSnoozed } from "@/lib/services/maintenance";
import { createReminder } from "@/lib/services/reminders";
import { processSendJob } from "@/lib/services/send";
import { exportMailboxStream, splitMbox, runImport } from "@/lib/services/data-transfer";
import { storage } from "@/lib/storage";
import { GET as filesRoute } from "@/app/api/files/[token]/route";
import { POST as inboundRaw } from "@/app/api/inbound/raw/route";
import { hmacHex } from "@/lib/crypto";
import { createUser, ctx, rawEmail, request } from "../helpers/factory";

const opts = { inboxCategories: true };

async function deliver(to: string, over: Partial<Parameters<typeof rawEmail>[0]> = {}) {
  const raw = await rawEmail({ from: "Giulia Ferri <giulia@studio.example>", to, subject: "Hello", text: "Hi there, how are you?", ...over });
  return ingestRawMessage(raw, { source: "local", envelope: { rcptTo: [to] } });
}

async function runSendJobs() {
  await db.update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, "pending"));
  for (const job of await claimJobs("test", 10)) {
    await processSendJob(job.payload as { messageId: string }, job.attempts, job.maxAttempts);
    await completeJob(job.id);
  }
}

afterEach(() => {
  setOutboundTransport(undefined);
  delete process.env.MAIL_OUTBOUND_DRIVER;
  process.env.MAIL_OUTBOUND_DRIVER = "none";
  resetEnvCache();
});

describe("receiving", () => {
  it("stores, classifies and notifies; re-delivery is idempotent", async () => {
    const alice = await createUser({ username: "alice" });
    const raw = await rawEmail({ from: "g@studio.example", to: alice.address, subject: "Plans", text: "See you at 10.", messageId: "plans-1@studio.example" });
    const a = await ingestRawMessage(raw, { source: "smtp", envelope: { rcptTo: [alice.address] } });
    const b = await ingestRawMessage(raw, { source: "imap" });
    expect(a.delivered[0].duplicate).toBe(false);
    expect(b.delivered[0].duplicate).toBe(true);
    const rows = await db.select().from(messages).where(eq(messages.userId, alice.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].folder).toBe("inbox");
    expect(rows[0].classification?.category.value).toBe("primary");
    expect(await db.select().from(notifications).where(eq(notifications.userId, alice.id))).toHaveLength(1);
    expect(await storage().get(rows[0].rawKey!)).toBeInstanceOf(Buffer);
  });

  it("delivers to plus-addresses and alias domains, rejects unknown mailboxes", async () => {
    const alice = await createUser({ username: "alice" });
    const res = await deliver("alice+news@mailed.test");
    expect(res.delivered).toHaveLength(1);
    await expect(deliver("nobody@mailed.test")).rejects.toBeInstanceOf(IngestError);
    const mixed = await ingestRawMessage(await rawEmail({ from: "x@example.org", to: alice.address, subject: "x", text: "x" }), {
      source: "smtp",
      envelope: { rcptTo: [alice.address, "ghost@mailed.test"] },
    });
    expect(mixed.delivered).toHaveLength(1);
    expect(mixed.rejected.map((r) => r.address)).toEqual(["ghost@mailed.test"]);
  });

  it("threads replies by In-Reply-To/References", async () => {
    const alice = await createUser({ username: "alice" });
    const first = await deliver(alice.address, { subject: "Site visit", messageId: "visit@x.example" });
    const reply = await deliver(alice.address, { subject: "Re: Site visit", messageId: "visit-2@x.example", inReplyTo: "visit@x.example" });
    expect(reply.delivered[0].threadId).toBe(first.delivered[0].threadId);
    const list = await listThreads(alice.id, { kind: "system", view: "inbox" }, opts);
    expect(list.threads).toHaveLength(1);
    expect(list.threads[0].messageCount).toBe(2);
  });

  it("routes phishing to Spam and blocks dangerous attachments", async () => {
    const alice = await createUser({ username: "alice" });
    const res = await deliver(alice.address, {
      from: '"PayPal Security" <alert@paypa1-verify.example>',
      subject: "Your account has been suspended",
      html: '<p>Verify your account within 24 hours.</p><a href="http://192.0.2.5/x">https://www.paypal.com/signin</a>',
      attachments: [{ filename: "update.exe", content: Buffer.from("MZ\x90\x00binary"), contentType: "application/octet-stream" }],
    });
    const [m] = await db.select().from(messages).where(eq(messages.id, res.delivered[0].messageId));
    expect(m.folder).toBe("spam");
    expect(m.isSuspicious).toBe(true);
    const [att] = await db.select().from(attachments).where(eq(attachments.messageId, m.id));
    expect(att.isDangerous).toBe(true);
    await expect(attachmentDownloadUrl(alice.id, att.id, { allowRisky: true })).rejects.toThrow(/blocked/);
  });

  it("marks the original message as bounced when a delivery report arrives", async () => {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const draft = await createDraft(alice.id, { mode: "new", to: [{ name: "", address: bob.address }], subject: "Hi", html: "<p>Hi</p>" });
    await sendDraft(alice.id, draft.id, {});
    await runSendJobs();
    const [sent] = await db.select().from(messages).where(eq(messages.id, draft.id));
    const dsn = Buffer.from(
      [
        "From: Mail Delivery System <MAILER-DAEMON@relay.example>",
        `To: ${alice.address}`,
        "Subject: Undelivered Mail Returned to Sender",
        "Message-ID: <dsn-1@relay.example>",
        "MIME-Version: 1.0",
        'Content-Type: multipart/report; report-type=delivery-status; boundary="b"',
        "",
        "--b",
        "Content-Type: text/plain",
        "",
        "Your message could not be delivered.",
        "--b",
        "Content-Type: message/delivery-status",
        "",
        "Reporting-MTA: dns; relay.example",
        "",
        "Final-Recipient: rfc822; carol@elsewhere.example",
        "Action: failed",
        "Status: 5.1.1",
        "Diagnostic-Code: smtp; 550 5.1.1 User unknown",
        "--b",
        "Content-Type: text/rfc822-headers",
        "",
        `Message-ID: <${sent.messageIdHeader}>`,
        "Subject: Hi",
        "--b--",
        "",
      ].join("\r\n"),
    );
    await ingestRawMessage(dsn, { source: "smtp", envelope: { rcptTo: [alice.address] } });
    const [after] = await db.select().from(messages).where(eq(messages.id, draft.id));
    expect(after.sendStatus).toBe("bounced");
    expect(after.sendError).toContain("User unknown");
  });
});

describe("sending", () => {
  it("delivers locally, saves the sent copy, threads replies and records contacts", async () => {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const draft = await createDraft(alice.id, { mode: "new" });
    await updateDraft(alice.id, draft.id, {
      to: [{ name: "Bob", address: bob.address }],
      bcc: [{ name: "", address: "alice@mailed.test" }],
      subject: "Lunch?",
      html: "<p>Lunch on <strong>Friday</strong>?</p><script>alert(1)</script>",
    });
    const res = await sendDraft(alice.id, draft.id, {});
    expect(res.status).toBe("queued");
    await runSendJobs();

    const [sent] = await db.select().from(messages).where(eq(messages.id, draft.id));
    expect(sent.folder).toBe("sent");
    expect(sent.sendStatus).toBe("sent");
    expect(sent.htmlBody).not.toContain("script");
    const raw = (await storage().get(sent.rawKey!)).toString();
    expect(raw).not.toMatch(/^Bcc:/im);

    const [received] = await db.select().from(messages).where(and(eq(messages.userId, bob.id), eq(messages.direction, "inbound")));
    expect(received.subject).toBe("Lunch?");
    expect(received.fromAddress).toBe(alice.address);
    const [c] = await db.select().from(contacts).where(and(eq(contacts.userId, alice.id), eq(contacts.address, bob.address)));
    expect(c.interactionCount).toBe(1);

    // Bob replies; the reply joins Alice's conversation.
    const reply = await createDraft(bob.id, { mode: "reply", sourceMessageId: received.id });
    expect(reply.to.map((t) => t.address)).toEqual([alice.address]);
    expect(reply.subject).toBe("Re: Lunch?");
    await updateDraft(bob.id, reply.id, { html: "<p>Sure!</p>" });
    await sendDraft(bob.id, reply.id, {});
    await runSendJobs();
    const thread = await getThread(alice.id, sent.threadId, { kind: "system", view: "inbox" });
    expect(thread.messages.map((m) => m.direction)).toEqual(["outbound", "inbound", "inbound"].slice(0, thread.messages.length));
    expect(thread.messages.some((m) => m.text.includes("Sure!"))).toBe(true);
  });

  it("refuses external recipients when no provider is configured, and before verification", async () => {
    const unverified = await createUser({ username: "newbie", verified: false });
    const d1 = await createDraft(unverified.id, { mode: "new", to: [{ name: "", address: "someone@gmail.example" }], subject: "x", html: "<p>x</p>" });
    await expect(sendDraft(unverified.id, d1.id, {})).rejects.toMatchObject({ status: 403 });
    const alice = await createUser({ username: "alice" });
    const d2 = await createDraft(alice.id, { mode: "new", to: [{ name: "", address: "someone@gmail.example" }], subject: "x", html: "<p>x</p>" });
    await expect(sendDraft(alice.id, d2.id, {})).rejects.toMatchObject({ status: 503, code: "provider_not_configured" });
  });

  it("sends through the provider, retries temporary failures and records permanent ones", async () => {
    process.env.MAIL_OUTBOUND_DRIVER = "smtp";
    process.env.SMTP_HOST = "smtp.test";
    resetEnvCache();
    const sentEnvelopes: { from: string; to: string[] }[] = [];
    let mode: "ok" | "temp" | "perm" = "temp";
    const fake: OutboundTransport = {
      name: "fake",
      async send({ envelope }) {
        if (mode === "temp") throw new TransportError("421 try later", false, 421);
        if (mode === "perm") throw new TransportError("550 mailbox unavailable", true, 550);
        sentEnvelopes.push(envelope);
        return { accepted: envelope.to, rejected: [] };
      },
      async verify() {},
    };
    setOutboundTransport(fake);
    const alice = await createUser({ username: "alice" });
    const d = await createDraft(alice.id, { mode: "new", to: [{ name: "", address: "carol@external.example" }], bcc: [{ name: "", address: "dave@external.example" }], subject: "Hello", html: "<p>Hi</p>" });
    await sendDraft(alice.id, d.id, {});

    await db.update(jobs).set({ runAt: new Date(0) });
    const [job] = await claimJobs("t", 1);
    await expect(processSendJob(job.payload as { messageId: string }, 1, 7)).rejects.toBeInstanceOf(TransportError);
    let [m] = await db.select().from(messages).where(eq(messages.id, d.id));
    expect(m.sendStatus).toBe("queued");
    expect(m.sendError).toMatch(/retrying/);

    mode = "ok";
    await processSendJob(job.payload as { messageId: string }, 2, 7);
    [m] = await db.select().from(messages).where(eq(messages.id, d.id));
    expect(m.sendStatus).toBe("sent");
    expect(sentEnvelopes[0]).toEqual({ from: alice.address, to: ["carol@external.example", "dave@external.example"] });

    mode = "perm";
    const d2 = await createDraft(alice.id, { mode: "new", to: [{ name: "", address: "erin@external.example" }], subject: "x", html: "<p>x</p>" });
    await sendDraft(alice.id, d2.id, {});
    await db.update(messages).set({ sendStatus: "queued" }).where(eq(messages.id, d2.id));
    await processSendJob({ messageId: d2.id }, 1, 7);
    [m] = await db.select().from(messages).where(eq(messages.id, d2.id));
    expect(m.sendStatus).toBe("failed");
    expect(m.sendError).toContain("550");
  });

  it("supports undo send and scheduled send", async () => {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const d = await createDraft(alice.id, { mode: "new", to: [{ name: "", address: bob.address }], subject: "Oops", html: "<p>x</p>" });
    await sendDraft(alice.id, d.id, {});
    await cancelSend(alice.id, d.id);
    const [back] = await db.select().from(messages).where(eq(messages.id, d.id));
    expect(back.folder).toBe("drafts");
    expect(back.sendStatus).toBe("draft");
    expect(await db.select().from(jobs).where(eq(jobs.status, "pending"))).toHaveLength(0);

    const at = new Date(Date.now() + 3600_000);
    const res = await sendDraft(alice.id, d.id, { scheduledAt: at.toISOString() });
    expect(res.status).toBe("scheduled");
    const counts = await mailboxCounts(alice.id, opts);
    expect(counts.totals.scheduled).toBe(1);
    const [job] = await db.select().from(jobs).where(eq(jobs.status, "pending"));
    expect(job.runAt.getTime()).toBe(at.getTime());
    await expect(sendDraft(alice.id, d.id, { scheduledAt: new Date(Date.now() + 1000).toISOString() })).rejects.toBeTruthy();
  });

  it("validates attachments by name, content and size", async () => {
    const alice = await createUser({ username: "alice" });
    const d = await createDraft(alice.id, { mode: "new" });
    const ok = await addDraftAttachment(alice.id, d.id, { name: "notes.txt", type: "text/plain", data: Buffer.from("hello") });
    expect(ok.filename).toBe("notes.txt");
    await expect(addDraftAttachment(alice.id, d.id, { name: "tool.exe", type: "application/octet-stream", data: Buffer.from("MZ...") })).rejects.toMatchObject({ status: 403 });
    await expect(addDraftAttachment(alice.id, d.id, { name: "photo.jpg", type: "image/jpeg", data: Buffer.from("MZ\x90\x00 disguised") })).rejects.toMatchObject({ status: 403 });
    await expect(addDraftAttachment(alice.id, d.id, { name: "big.bin", type: "application/octet-stream", data: Buffer.alloc(21 * 1024 * 1024) })).rejects.toMatchObject({ status: 413 });

    const { url } = await attachmentDownloadUrl(alice.id, ok.id);
    const token = url.split("/").pop()!;
    const res = await filesRoute(request("GET", url), ctx({ token }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("hello");
    const tampered = await filesRoute(request("GET", `${url}x`), ctx({ token: `${token}x` }));
    expect(tampered.status).toBe(410);
  });
});

describe("organising", () => {
  it("archives, trashes, restores and deletes forever", async () => {
    const alice = await createUser({ username: "alice" });
    const { delivered } = await deliver(alice.address);
    const t = delivered[0].threadId;
    await applyAction(alice.id, { threadIds: [t], action: { type: "archive" } });
    expect((await listThreads(alice.id, { kind: "system", view: "archive" }, opts)).total).toBe(1);
    await applyAction(alice.id, { threadIds: [t], action: { type: "trash" } });
    expect((await listThreads(alice.id, { kind: "system", view: "trash" }, opts)).total).toBe(1);
    await applyAction(alice.id, { threadIds: [t], action: { type: "move_to_inbox" } });
    const [m] = await db.select().from(messages).where(eq(messages.threadId, t));
    expect(m.folder).toBe("archive");
    await applyAction(alice.id, { threadIds: [t], action: { type: "trash" } });
    await emptyFolder(alice.id, "trash");
    expect(await db.select().from(messages).where(eq(messages.userId, alice.id))).toHaveLength(0);
    expect(await db.select().from(threads).where(eq(threads.userId, alice.id))).toHaveLength(0);
  });

  it("learns from spam reports and not-spam corrections", async () => {
    const alice = await createUser({ username: "alice" });
    const { delivered } = await deliver(alice.address);
    const t = delivered[0].threadId;
    await applyAction(alice.id, { threadIds: [t], action: { type: "spam" } });
    let [stats] = await db.select().from(classifierStats).where(eq(classifierStats.userId, alice.id));
    expect(stats.spamDocs).toBe(1);
    await applyAction(alice.id, { threadIds: [t], action: { type: "not_spam" } });
    [stats] = await db.select().from(classifierStats).where(eq(classifierStats.userId, alice.id));
    expect(stats).toMatchObject({ spamDocs: 0, hamDocs: 1 });
    const [m] = await db.select().from(messages).where(eq(messages.threadId, t));
    expect(m.folder).toBe("inbox");
  });

  it("applies labels, stars, categories and blocks senders", async () => {
    const alice = await createUser({ username: "alice" });
    const { delivered } = await deliver(alice.address);
    const t = delivered[0].threadId;
    const label = await createLabel(alice.id, { name: "Clients", color: "teal" });
    await applyAction(alice.id, { threadIds: [t], action: { type: "add_label", labelId: label.id } });
    await applyAction(alice.id, { threadIds: [t], action: { type: "star" } });
    const byLabel = await listThreads(alice.id, { kind: "label", labelId: label.id }, opts);
    expect(byLabel.threads[0].labels.map((l) => l.name)).toEqual(["Clients"]);
    expect(byLabel.threads[0].starred).toBe(true);

    await applyAction(alice.id, { threadIds: [t], action: { type: "set_category", category: "updates" } });
    const next = await deliver(alice.address, { subject: "Another one" });
    const [m2] = await db.select().from(messages).where(eq(messages.id, next.delivered[0].messageId));
    expect(m2.category).toBe("updates");

    await applyAction(alice.id, { threadIds: [t], action: { type: "block_sender" } });
    const blocked = await deliver(alice.address, { subject: "Third" });
    const [m3] = await db.select().from(messages).where(eq(messages.id, blocked.delivered[0].messageId));
    expect(m3.folder).toBe("spam");
  });

  it("snoozes and brings conversations back", async () => {
    const alice = await createUser({ username: "alice" });
    const { delivered } = await deliver(alice.address);
    const t = delivered[0].threadId;
    await applyAction(alice.id, { threadIds: [t], action: { type: "snooze", until: new Date(Date.now() + 3600_000).toISOString() } });
    expect((await listThreads(alice.id, { kind: "system", view: "inbox" }, opts)).total).toBe(0);
    expect((await listThreads(alice.id, { kind: "system", view: "snoozed" }, opts)).total).toBe(1);
    await db.update(messages).set({ snoozedUntil: new Date(Date.now() - 1000) }).where(eq(messages.threadId, t));
    await wakeSnoozed();
    expect((await listThreads(alice.id, { kind: "system", view: "inbox" }, opts)).total).toBe(1);
  });

  it("fires reply reminders only when nobody answered", async () => {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const d = await createDraft(alice.id, { mode: "new", to: [{ name: "", address: bob.address }], subject: "Quote?", html: "<p>?</p>" });
    await sendDraft(alice.id, d.id, {});
    await runSendJobs();
    await createReminder(alice.id, { messageId: d.id, remindAt: new Date(Date.now() + 60_000).toISOString(), onlyIfNoReply: true, note: "" });
    await db.update(reminders).set({ remindAt: new Date(Date.now() - 1000) });
    await fireReminders();
    const notes = await db.select().from(notifications).where(and(eq(notifications.userId, alice.id), eq(notifications.type, "reminder")));
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe("No reply yet");
  });

  it("searches subjects, bodies, senders and recipients", async () => {
    const alice = await createUser({ username: "alice" });
    await deliver(alice.address, { subject: "Quarterly report", text: "Numbers for the budget review", from: "Paolo <paolo@acme.example>" });
    await deliver(alice.address, { subject: "Dinner", text: "Pizza tonight?", from: "Sara <sara@friends.example>" });
    const q = async (query: string) => (await listThreads(alice.id, { kind: "search", query }, opts)).total;
    expect(await q("budget")).toBe(1);
    expect(await q("quarter")).toBe(1);
    expect(await q('"budget review"')).toBe(1);
    expect(await q("from:paolo")).toBe(1);
    expect(await q("from:acme.example subject:dinner")).toBe(0);
    expect(await q("to:alice")).toBe(2);
    expect(await q("pizza -tonight")).toBe(0);
    expect(await q("is:unread")).toBe(2);
    expect(await q("has:attachment")).toBe(0);
  });
});

describe("inbound integrations", () => {
  it("accepts signed webhook deliveries and rejects bad signatures", async () => {
    const alice = await createUser({ username: "alice" });
    const raw = await rawEmail({ from: "x@example.org", to: alice.address, subject: "Via webhook", text: "hello" });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = hmacHex("webhook-test-secret", Buffer.concat([Buffer.from(`${ts}.`), raw]));
    const make = (signature: string) =>
      new (request("POST", "/api/inbound/raw").constructor as typeof Request)("http://localhost:3000/api/inbound/raw", {
        method: "POST",
        headers: { "x-mailed-timestamp": ts, "x-mailed-signature": signature, "x-mailed-envelope-to": alice.address, "content-length": String(raw.length) },
        body: new Uint8Array(raw),
      });
    const bad = await inboundRaw(make("deadbeef") as never);
    expect(bad.status).toBe(401);
    const ok = await inboundRaw(make(sig) as never);
    expect(ok.status).toBe(200);
    expect((await ok.json()).delivered).toBe(1);
  });

  it("receives mail over SMTP with the built-in receiver", async () => {
    const alice = await createUser({ username: "alice" });
    process.env.INBOUND_SMTP_PORT = "2626";
    process.env.INBOUND_SMTP_HOST = "127.0.0.1";
    process.env.INBOUND_SMTP_VERIFY_SENDER = "false";
    resetEnvCache();
    const { startSmtpServer } = await import("@/worker/smtp-server");
    const server = startSmtpServer();
    await new Promise((r) => setTimeout(r, 200));
    try {
      const nodemailer = (await import("nodemailer")).default;
      const t = nodemailer.createTransport({ host: "127.0.0.1", port: 2626, secure: false, ignoreTLS: true });
      const info = await t.sendMail({ from: "sender@example.org", to: alice.address, subject: "Over SMTP", text: "Delivered over SMTP" });
      expect(info.accepted).toEqual([alice.address]);
      await expect(t.sendMail({ from: "sender@example.org", to: "ghost@mailed.test", subject: "x", text: "x" })).rejects.toThrow(/550/);
      await expect(t.sendMail({ from: "sender@example.org", to: "someone@gmail.example", subject: "x", text: "x" })).rejects.toThrow(/554|Relaying/);
      const [m] = await db.select().from(messages).where(eq(messages.userId, alice.id));
      expect(m.subject).toBe("Over SMTP");
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
      resetEnvCache();
    }
  });
});

describe("data portability", () => {
  it("exports mbox and imports it into another mailbox without duplicates", async () => {
    const alice = await createUser({ username: "alice" });
    await deliver(alice.address, { subject: "First", messageId: "first@x.example" });
    await deliver(alice.address, { subject: "From me", from: `Alice <${alice.address}>`, messageId: "second@x.example" });
    const chunks: Uint8Array[] = [];
    const reader = exportMailboxStream(alice.id).getReader();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const mbox = Buffer.concat(chunks);
    expect(splitMbox(mbox)).toHaveLength(2);

    const bob = await createUser({ username: "bob" });
    const key = `u/${bob.id}/imports/test`;
    await storage().put(key, mbox, "application/mbox");
    const result = await runImport(bob.id, key, "archive");
    expect(result).toEqual({ imported: 2, duplicates: 0, failed: 0 });
    const imported = await db.select().from(messages).where(eq(messages.userId, bob.id));
    expect(imported.map((m) => m.folder).sort()).toEqual(["archive", "archive"]);

    await storage().put(key, mbox, "application/mbox");
    expect(await runImport(bob.id, key, "archive")).toEqual({ imported: 0, duplicates: 2, failed: 0 });
    const recips = await db.select().from(messageRecipients).where(eq(messageRecipients.userId, bob.id));
    expect(recips.length).toBeGreaterThan(0);
  });
});
