import { and, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { jobs, labels, linkedAccounts, messageLabels, messages, notifications } from "@/lib/db/schema";
import { claimJobs, completeJob } from "@/lib/jobs";
import { setLinkedConnector, LinkedAuthError, type ConnectionSettings, type FetchedMessage, type LinkedConnector } from "@/lib/linked/connect";
import { runDueLinkedSyncs, syncLinkedAccount } from "@/lib/linked/sync";
import type { OutboundTransport } from "@/lib/mail/transport";
import { getMe } from "@/lib/services/account";
import { createDraft, sendDraft, updateDraft } from "@/lib/services/compose";
import { createPasswordAccount, listLinkedAccounts, removeLinkedAccount, updateLinkedAccount } from "@/lib/services/linked-accounts";
import { processSendJob } from "@/lib/services/send";
import { AppError } from "@/lib/errors";
import { GET as listRoute } from "@/app/api/linked-accounts/route";
import { createUser, rawEmail, request, signIn } from "../helpers/factory";

/** An in-memory mailbox standing in for Gmail. */
class FakeProvider implements LinkedConnector {
  uidValidity = "1";
  messages: { uid: number; raw: Buffer; seen: boolean; date: Date }[] = [];
  password = "app-password";
  sent: { envelope: { from: string; to: string[] }; raw: Buffer; settings: ConnectionSettings }[] = [];
  logins: ConnectionSettings[] = [];

  private check(s: ConnectionSettings) {
    this.logins.push(s);
    if (s.auth.type !== "password" || s.auth.password !== this.password) throw new LinkedAuthError("The email or password was rejected.");
  }

  async add(raw: Buffer, opts: { seen?: boolean; daysAgo?: number } = {}) {
    const uid = (this.messages.at(-1)?.uid ?? 0) + 1;
    this.messages.push({ uid, raw, seen: opts.seen ?? false, date: new Date(Date.now() - (opts.daysAgo ?? 0) * 86400_000) });
    return uid;
  }

  async verify(s: ConnectionSettings) {
    this.check(s);
  }

  async openInbox(s: ConnectionSettings) {
    this.check(s);
    const all = this.messages;
    const toFetched = (m: (typeof all)[number]): FetchedMessage => ({ uid: m.uid, source: m.raw, seen: m.seen, internalDate: m.date });
    return {
      uidValidity: this.uidValidity,
      uidNext: (all.at(-1)?.uid ?? 0) + 1,
      searchSince: async (since: Date) => all.filter((m) => m.date >= since).map((m) => m.uid),
      fetch: async function* (range: number[] | { from: number }) {
        const list = Array.isArray(range) ? all.filter((m) => range.includes(m.uid)) : all.filter((m) => m.uid >= range.from);
        // Like IMAP, "N:*" past the end still returns the newest message.
        const out = !Array.isArray(range) && list.length === 0 && all.length ? [all.at(-1)!] : list;
        for (const m of out) yield toFetched(m);
      },
      close: async () => {},
    };
  }

  async transport(s: ConnectionSettings): Promise<OutboundTransport & { close(): void }> {
    this.check(s);
    return {
      name: "fake",
      verify: async () => {},
      close: () => {},
      send: async (input) => {
        this.sent.push({ ...input, settings: s });
        return { accepted: input.envelope.to, rejected: [] };
      },
    };
  }
}

let provider: FakeProvider;
beforeEach(() => {
  provider = new FakeProvider();
  setLinkedConnector(provider);
});
afterEach(() => setLinkedConnector(null));

async function linkGmail(userId: string, password = "app-password") {
  return createPasswordAccount(userId, { provider: "gmail", email: "Alice.Rossi@gmail.com", password, displayName: "Alice R." });
}

async function account(id: string) {
  const [a] = await db.select().from(linkedAccounts).where(eq(linkedAccounts.id, id));
  return a;
}

async function runSendJobs() {
  await db.update(jobs).set({ runAt: new Date(0) }).where(eq(jobs.status, "pending"));
  for (const job of await claimJobs("test", 10)) {
    await processSendJob(job.payload as { messageId: string }, job.attempts, job.maxAttempts);
    await completeJob(job.id);
  }
}

describe("linking", () => {
  it("checks the sign-in, encrypts the password and creates a label", async () => {
    const alice = await createUser({ username: "alice" });
    const dto = await createPasswordAccount(alice.id, { provider: "gmail", email: "alice.rossi@gmail.com", password: "app-password" });
    expect(dto).toMatchObject({ email: "alice.rossi@gmail.com", provider: "gmail", status: "active", importing: true, authType: "password" });
    expect(JSON.stringify(dto)).not.toContain("app-password");
    expect(provider.logins[0]).toMatchObject({ username: "alice.rossi@gmail.com", imap: { host: "imap.gmail.com", port: 993 }, smtp: { host: "smtp.gmail.com", port: 465 } });
    const row = await account(dto.id);
    expect(row.secret).not.toContain("app-password");
    const [label] = await db.select().from(labels).where(eq(labels.id, dto.labelId!));
    expect(label).toMatchObject({ name: "alice.rossi@gmail.com", color: "red" });

    await signIn(alice.id);
    const res = await listRoute(request("GET", "/api/linked-accounts"), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(body.accounts).toHaveLength(1);
    expect(JSON.stringify(body)).not.toContain(row.secret);
  });

  it("strips the spaces Google shows in app passwords", async () => {
    const alice = await createUser({ username: "alice" });
    provider.password = "abcdefghijklmnop";
    await createPasswordAccount(alice.id, { provider: "gmail", email: "a@gmail.com", password: "abcd efgh ijkl mnop" });
    expect(provider.logins[0].auth).toEqual({ type: "password", password: "abcdefghijklmnop" });
  });

  it("rejects wrong passwords, duplicates, Outlook passwords and Mailed addresses", async () => {
    const alice = await createUser({ username: "alice" });
    await expect(linkGmail(alice.id, "wrong")).rejects.toMatchObject({ status: 400, code: "auth_failed" });
    expect(await db.select().from(linkedAccounts)).toHaveLength(0);
    await linkGmail(alice.id);
    await expect(linkGmail(alice.id)).rejects.toMatchObject({ status: 409 });
    await expect(createPasswordAccount(alice.id, { provider: "outlook", email: "a@outlook.com", password: "x" })).rejects.toMatchObject({ code: "oauth_required" });
    await expect(createPasswordAccount(alice.id, { provider: "other", email: alice.address, password: "x", imap: { host: "imap.example.com", port: 993, security: "tls" }, smtp: { host: "smtp.example.com", port: 465, security: "tls" } })).rejects.toBeInstanceOf(AppError);
  });

  it("is listed among the addresses the user can send from", async () => {
    const alice = await createUser({ username: "alice" });
    const dto = await linkGmail(alice.id);
    expect((await getMe(alice.id)).senders).toEqual([{ id: dto.id, email: "alice.rossi@gmail.com", displayName: "Alice R.", provider: "gmail" }]);
    await updateLinkedAccount(alice.id, dto.id, { sendEnabled: false });
    expect((await getMe(alice.id)).senders).toEqual([]);
  });
});

describe("fetching", () => {
  it("imports recent history quietly, then new mail with notifications", async () => {
    const alice = await createUser({ username: "alice" });
    await provider.add(await rawEmail({ from: "old@example.org", to: "alice.rossi@gmail.com", subject: "Too old", text: "x", messageId: "old@example.org" }), { daysAgo: 90 });
    await provider.add(await rawEmail({ from: "Marco <marco@example.org>", to: "alice.rossi@gmail.com", subject: "Dinner", text: "Friday?", messageId: "dinner@example.org" }), { seen: true, daysAgo: 2 });
    await provider.add(await rawEmail({ from: "news@shop.example", to: "alice.rossi@gmail.com", subject: "Sale", text: "50% off", messageId: "sale@shop.example" }), { daysAgo: 1 });
    const dto = await linkGmail(alice.id);

    await runDueLinkedSyncs();
    let rows = await db.select().from(messages).where(eq(messages.userId, alice.id));
    expect(rows.map((m) => m.subject).sort()).toEqual(["Dinner", "Sale"]);
    expect(rows.every((m) => m.linkedAccountId === dto.id && m.folder === "inbox")).toBe(true);
    expect(rows.find((m) => m.subject === "Dinner")?.isRead).toBe(true);
    expect(rows.find((m) => m.subject === "Sale")?.isRead).toBe(false);
    expect(await db.select().from(messageLabels).where(eq(messageLabels.labelId, dto.labelId!))).toHaveLength(2);
    expect(await db.select().from(notifications).where(eq(notifications.userId, alice.id))).toHaveLength(0);
    let a = await account(dto.id);
    expect(a).toMatchObject({ backfillDone: true, lastUid: 3, status: "active" });
    expect(a.nextSyncAt!.getTime()).toBeGreaterThan(Date.now());

    // Nothing is due yet; a new message arrives and the next run picks it up.
    await runDueLinkedSyncs();
    expect(await db.select().from(messages).where(eq(messages.userId, alice.id))).toHaveLength(2);
    await provider.add(await rawEmail({ from: "giulia@studio.example", to: "alice.rossi@gmail.com", subject: "Timeline", text: "Attached.", messageId: "timeline@studio.example" }));
    await db.update(linkedAccounts).set({ nextSyncAt: new Date(0) }).where(eq(linkedAccounts.id, dto.id));
    await runDueLinkedSyncs();
    rows = await db.select().from(messages).where(eq(messages.userId, alice.id));
    expect(rows).toHaveLength(3);
    expect(await db.select().from(notifications).where(eq(notifications.userId, alice.id))).toHaveLength(1);

    // Re-running with no new mail ("4:*" returns the last message again) imports nothing.
    a = await account(dto.id);
    expect((await syncLinkedAccount(a)).imported).toBe(0);
    expect(await db.select().from(messages).where(eq(messages.userId, alice.id))).toHaveLength(3);
  });

  it("re-imports after UIDVALIDITY changes without duplicating", async () => {
    const alice = await createUser({ username: "alice" });
    await provider.add(await rawEmail({ from: "m@example.org", to: "alice.rossi@gmail.com", subject: "One", text: "1", messageId: "one@example.org" }));
    const dto = await linkGmail(alice.id);
    await syncLinkedAccount(await account(dto.id));
    provider.uidValidity = "2";
    await syncLinkedAccount(await account(dto.id));
    expect(await db.select().from(messages).where(eq(messages.userId, alice.id))).toHaveLength(1);
    expect((await account(dto.id)).uidValidity).toBe("2");
  });

  it("pauses and notifies once when the password stops working", async () => {
    const alice = await createUser({ username: "alice" });
    const dto = await linkGmail(alice.id);
    provider.password = "changed";
    await syncLinkedAccount(await account(dto.id));
    await syncLinkedAccount(await account(dto.id));
    const a = await account(dto.id);
    expect(a.status).toBe("auth_error");
    expect(a.nextSyncAt).toBeNull();
    expect(await db.select().from(notifications).where(eq(notifications.userId, alice.id))).toHaveLength(1);
    await db.update(linkedAccounts).set({ nextSyncAt: new Date(0) }).where(eq(linkedAccounts.id, dto.id));
    const before = provider.logins.length;
    await runDueLinkedSyncs();
    expect(provider.logins.length).toBe(before);

    provider.password = "new-password";
    await updateLinkedAccount(alice.id, dto.id, { password: "new-password" });
    expect((await account(dto.id)).status).toBe("active");
  });
});

describe("sending", () => {
  it("sends through the linked account even without a server-wide provider", async () => {
    const alice = await createUser({ username: "alice" });
    const dto = await linkGmail(alice.id);
    const draft = await createDraft(alice.id, { mode: "new", to: [{ name: "", address: "bob@example.org" }], subject: "Hi", html: "<p>Hello Bob</p>" });
    await updateDraft(alice.id, draft.id, { fromAccountId: dto.id });
    await sendDraft(alice.id, draft.id, {});
    await runSendJobs();

    expect(provider.sent).toHaveLength(1);
    const sent = provider.sent[0];
    expect(sent.envelope).toEqual({ from: "alice.rossi@gmail.com", to: ["bob@example.org"] });
    expect(sent.settings.smtp.host).toBe("smtp.gmail.com");
    const raw = sent.raw.toString();
    expect(raw).toMatch(/^From: "?Alice R\.?"? <alice\.rossi@gmail\.com>/m);
    expect(raw).toMatch(/^Message-ID: <[^>]+@gmail\.com>/m);
    const [m] = await db.select().from(messages).where(eq(messages.id, draft.id));
    expect(m).toMatchObject({ sendStatus: "sent", folder: "sent", fromAddress: "alice.rossi@gmail.com", linkedAccountId: dto.id });
  });

  it("replies from the account the message arrived at", async () => {
    const alice = await createUser({ username: "alice" });
    await provider.add(await rawEmail({ from: "Marco <marco@example.org>", to: "alice.rossi@gmail.com", subject: "Dinner", text: "Friday?", messageId: "dinner@example.org" }));
    const dto = await linkGmail(alice.id);
    await syncLinkedAccount(await account(dto.id));
    const [incoming] = await db.select().from(messages).where(and(eq(messages.userId, alice.id), eq(messages.folder, "inbox")));
    const reply = await createDraft(alice.id, { mode: "reply_all", sourceMessageId: incoming.id });
    expect(reply.accountId).toBe(dto.id);
    expect(reply.from.address).toBe("alice.rossi@gmail.com");
    // The linked address itself is never added to the recipients.
    expect([...reply.to, ...reply.cc].map((a) => a.address)).toEqual(["marco@example.org"]);
  });

  it("refuses accounts that belong to someone else", async () => {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const dto = await linkGmail(alice.id);
    const draft = await createDraft(bob.id, { mode: "new", subject: "x" });
    await expect(updateDraft(bob.id, draft.id, { fromAccountId: dto.id })).rejects.toMatchObject({ status: 404 });
    await expect(createDraft(bob.id, { mode: "new", fromAccountId: dto.id })).rejects.toMatchObject({ status: 404 });
  });
});

describe("removing", () => {
  it("keeps imported mail by default, or deletes it with the label", async () => {
    const alice = await createUser({ username: "alice" });
    await provider.add(await rawEmail({ from: "m@example.org", to: "alice.rossi@gmail.com", subject: "One", text: "1", messageId: "one@example.org" }));
    const first = await linkGmail(alice.id);
    await syncLinkedAccount(await account(first.id));
    await removeLinkedAccount(alice.id, first.id, { deleteMail: false });
    const kept = await db.select().from(messages).where(eq(messages.userId, alice.id));
    expect(kept).toHaveLength(1);
    expect(kept[0].linkedAccountId).toBeNull();

    await db.delete(messages);
    const second = await linkGmail(alice.id);
    await syncLinkedAccount(await account(second.id));
    expect(await db.select().from(messages).where(eq(messages.userId, alice.id))).toHaveLength(1);
    const res = await removeLinkedAccount(alice.id, second.id, { deleteMail: true });
    expect(res.deleted).toBe(1);
    expect(await db.select().from(messages).where(eq(messages.userId, alice.id))).toHaveLength(0);
    expect(await db.select().from(labels).where(eq(labels.id, second.labelId!))).toHaveLength(0);
    expect((await listLinkedAccounts(alice.id)).accounts).toHaveLength(0);
  });
});
