import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { GET as listThreadsRoute } from "@/app/api/threads/route";
import { GET as getThreadRoute } from "@/app/api/threads/[id]/route";
import { POST as actionsRoute } from "@/app/api/actions/route";
import { GET as rawRoute } from "@/app/api/messages/[id]/raw/route";
import { GET as attachmentRoute, DELETE as deleteAttachmentRoute } from "@/app/api/attachments/[id]/route";
import { PATCH as patchDraft, DELETE as deleteDraft, GET as getDraftRoute } from "@/app/api/drafts/[id]/route";
import { POST as sendDraftRoute } from "@/app/api/drafts/[id]/send/route";
import { DELETE as deleteLabelRoute, PATCH as patchLabelRoute } from "@/app/api/labels/[id]/route";
import { POST as createRuleRoute } from "@/app/api/rules/route";
import { POST as createReminderRoute } from "@/app/api/reminders/route";
import { DELETE as deleteContactRoute } from "@/app/api/contacts/[id]/route";
import { DELETE as revokeSessionRoute } from "@/app/api/sessions/[id]/route";
import { POST as createDraftRoute } from "@/app/api/drafts/route";
import { db } from "@/lib/db";
import { attachments, labels, messages, sessions } from "@/lib/db/schema";
import { ingestRawMessage } from "@/lib/mail/ingest";
import { createDraft } from "@/lib/services/compose";
import { createContact } from "@/lib/services/contacts";
import { createLabel } from "@/lib/services/labels";
import type { ThreadListResponse } from "@/lib/types";
import { createUser, ctx, json, rawEmail, request, signIn } from "../helpers/factory";

type U = Awaited<ReturnType<typeof createUser>>;
let alice: U;
let mallory: U;
let threadId: string;
let messageId: string;
let attachmentId: string;
let labelId: string;
let draftId: string;
let contactId: string;

beforeEach(async () => {
  alice = await createUser({ username: "alice" });
  mallory = await createUser({ username: "mallory" });
  const raw = await rawEmail({
    from: "Giulia <giulia@studio.example>",
    to: alice.address,
    subject: "Confidential contract",
    text: "The secret number is 4242.",
    attachments: [{ filename: "contract.pdf", content: Buffer.from("%PDF-1.4 test"), contentType: "application/pdf" }],
  });
  const res = await ingestRawMessage(raw, { source: "local", envelope: { rcptTo: [alice.address] } });
  threadId = res.delivered[0].threadId;
  messageId = res.delivered[0].messageId;
  const [att] = await db.select().from(attachments).where(eq(attachments.messageId, messageId));
  attachmentId = att.id;
  labelId = (await createLabel(alice.id, { name: "Legal", color: "blue" })).id;
  draftId = (await createDraft(alice.id, { mode: "new", to: [{ name: "", address: "x@example.org" }], subject: "Private draft", html: "<p>hi</p>" })).id;
  contactId = (await createContact(alice.id, { name: "Giulia", address: "giulia@studio.example" })).id;
  await signIn(mallory.id);
});

describe("cross-account isolation", () => {
  it("never lists or searches another user's mail", async () => {
    for (const path of ["/api/threads?view=inbox", "/api/threads?view=all", "/api/threads?q=secret", "/api/threads?q=contract%20in:anywhere"]) {
      const res = await listThreadsRoute(request("GET", path), ctx());
      const body = await json<ThreadListResponse>(res);
      expect(body.threads).toHaveLength(0);
      expect(body.total).toBe(0);
    }
  });

  it("returns 404 for another user's thread, raw source and attachment", async () => {
    expect((await getThreadRoute(request("GET", `/api/threads/${threadId}`), ctx({ id: threadId }))).status).toBe(404);
    expect((await rawRoute(request("GET", `/api/messages/${messageId}/raw`), ctx({ id: messageId }))).status).toBe(404);
    expect((await attachmentRoute(request("GET", `/api/attachments/${attachmentId}?format=json`), ctx({ id: attachmentId }))).status).toBe(404);
    expect((await deleteAttachmentRoute(request("DELETE", `/api/attachments/${attachmentId}`), ctx({ id: attachmentId }))).status).toBe(404);
  });

  it("ignores actions on another user's conversations", async () => {
    for (const action of [{ type: "trash" }, { type: "mark_unread" }, { type: "spam" }, { type: "add_label", labelId }, { type: "star" }]) {
      const res = await actionsRoute(request("POST", "/api/actions", { threadIds: [threadId], messageIds: [messageId], action }), ctx());
      if (res.status === 200) expect((await json<{ affected: number }>(res)).affected).toBe(0);
      else expect(res.status).toBe(404);
    }
    const [m] = await db.select().from(messages).where(eq(messages.id, messageId));
    expect(m.folder).toBe("inbox");
    expect(m.isStarred).toBe(false);
  });

  it("cannot read, edit, send or delete another user's draft", async () => {
    expect((await getDraftRoute(request("GET", `/api/drafts/${draftId}`), ctx({ id: draftId }))).status).toBe(404);
    expect((await patchDraft(request("PATCH", `/api/drafts/${draftId}`, { subject: "pwned" }), ctx({ id: draftId }))).status).toBe(404);
    expect((await sendDraftRoute(request("POST", `/api/drafts/${draftId}/send`, {}), ctx({ id: draftId }))).status).toBe(404);
    expect((await deleteDraft(request("DELETE", `/api/drafts/${draftId}`), ctx({ id: draftId }))).status).toBe(404);
    const [d] = await db.select().from(messages).where(eq(messages.id, draftId));
    expect(d.subject).toBe("Private draft");
  });

  it("cannot reply to or forward another user's message", async () => {
    const res = await createDraftRoute(request("POST", "/api/drafts", { mode: "forward", sourceMessageId: messageId }), ctx());
    expect(res.status).toBe(404);
  });

  it("cannot touch another user's labels, contacts, reminders or sessions", async () => {
    expect((await patchLabelRoute(request("PATCH", `/api/labels/${labelId}`, { name: "x" }), ctx({ id: labelId }))).status).toBe(404);
    expect((await deleteLabelRoute(request("DELETE", `/api/labels/${labelId}`), ctx({ id: labelId }))).status).toBe(404);
    expect(await db.select().from(labels).where(eq(labels.id, labelId))).toHaveLength(1);
    expect((await deleteContactRoute(request("DELETE", `/api/contacts/${contactId}`), ctx({ id: contactId }))).status).toBe(404);
    const reminder = await createReminderRoute(
      request("POST", "/api/reminders", { messageId, remindAt: new Date(Date.now() + 86400_000).toISOString() }),
      ctx(),
    );
    expect(reminder.status).toBe(404);
    const rule = await createRuleRoute(
      request("POST", "/api/rules", { name: "steal", conditions: [{ field: "from", op: "contains", value: "a" }], actions: [{ type: "apply_label", labelId }] }),
      ctx(),
    );
    expect(rule.status).toBe(400);
    const [aliceSession] = await db.select().from(sessions).where(eq(sessions.userId, alice.id));
    if (aliceSession) {
      expect((await revokeSessionRoute(request("DELETE", `/api/sessions/${aliceSession.id}`), ctx({ id: aliceSession.id }))).status).toBe(404);
    }
  });

  it("rejects malformed identifiers without leaking errors", async () => {
    expect((await getThreadRoute(request("GET", "/api/threads/' or 1=1 --"), ctx({ id: "' or 1=1 --" }))).status).toBe(404);
    const res = await actionsRoute(request("POST", "/api/actions", { threadIds: ["not-a-uuid"], action: { type: "trash" } }), ctx());
    expect(res.status).toBe(400);
  });

  it("still lets the owner see everything", async () => {
    await signIn(alice.id);
    const list = await json<ThreadListResponse>(await listThreadsRoute(request("GET", "/api/threads?view=inbox"), ctx()));
    expect(list.threads.map((t) => t.id)).toContain(threadId);
    const att = await attachmentRoute(request("GET", `/api/attachments/${attachmentId}?format=json`), ctx({ id: attachmentId }));
    expect(att.status).toBe(200);
    const [own] = await db.select().from(messages).where(and(eq(messages.id, messageId), eq(messages.userId, alice.id)));
    expect(own).toBeTruthy();
  });
});
