import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { emailRules, labels, messageRecipients, messages, type EmailRule } from "../db/schema";
import { badRequest, conflict, notFound } from "../errors";
import { ruleMatches } from "../mail/rules";
import { CATEGORIES } from "../types";
import { applyAction, type ActionRequest } from "./actions";

const conditionSchema = z.object({
  field: z.enum(["from", "to", "subject", "body", "has_attachment", "list_id"]),
  op: z.enum(["contains", "not_contains", "equals", "ends_with", "is_true"]),
  value: z.string().trim().max(500),
});

const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("apply_label"), labelId: z.string().uuid() }),
  z.object({ type: z.literal("mark_read") }),
  z.object({ type: z.literal("star") }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("trash") }),
  z.object({ type: z.literal("mark_important") }),
  z.object({ type: z.literal("set_category"), category: z.enum(CATEGORIES) }),
  z.object({ type: z.literal("mark_spam") }),
  z.object({ type: z.literal("never_spam") }),
]);

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1, "Enter a name.").max(100),
  enabled: z.boolean().default(true),
  match: z.enum(["all", "any"]).default("all"),
  conditions: z.array(conditionSchema).min(1, "Add at least one condition.").max(10),
  actions: z.array(actionSchema).min(1, "Add at least one action.").max(10),
  stopProcessing: z.boolean().default(false),
});

async function assertLabels(userId: string, input: z.infer<typeof ruleInputSchema>) {
  const ids = input.actions.flatMap((a) => (a.type === "apply_label" ? [a.labelId] : []));
  if (ids.length === 0) return;
  const owned = await db.select({ id: labels.id }).from(labels).where(and(eq(labels.userId, userId), inArray(labels.id, ids)));
  if (owned.length !== new Set(ids).size) throw badRequest("One of the selected labels does not exist.");
}

const toDTO = (r: EmailRule) => ({
  id: r.id,
  name: r.name,
  enabled: r.enabled,
  match: r.match,
  conditions: r.conditions,
  actions: r.actions,
  stopProcessing: r.stopProcessing,
  position: r.position,
});

export async function listRules(userId: string) {
  const rows = await db.select().from(emailRules).where(eq(emailRules.userId, userId)).orderBy(asc(emailRules.position), asc(emailRules.createdAt));
  return rows.map(toDTO);
}

export async function createRule(userId: string, input: z.infer<typeof ruleInputSchema>) {
  await assertLabels(userId, input);
  const count = await db.$count(emailRules, eq(emailRules.userId, userId));
  if (count >= 100) throw conflict("You can create up to 100 filters.");
  const [row] = await db.insert(emailRules).values({ userId, ...input, position: count }).returning();
  return toDTO(row);
}

export async function updateRule(userId: string, id: string, input: z.infer<typeof ruleInputSchema>) {
  await assertLabels(userId, input);
  const [row] = await db
    .update(emailRules)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(emailRules.id, id), eq(emailRules.userId, userId)))
    .returning();
  if (!row) throw notFound("Filter not found.");
  return toDTO(row);
}

export async function deleteRule(userId: string, id: string) {
  const rows = await db.delete(emailRules).where(and(eq(emailRules.id, id), eq(emailRules.userId, userId))).returning({ id: emailRules.id });
  if (rows.length === 0) throw notFound("Filter not found.");
}

/** Runs a filter over existing mail in Inbox and Archive (most recent 5,000 messages). */
export async function applyRuleToExisting(userId: string, id: string) {
  const [rule] = await db.select().from(emailRules).where(and(eq(emailRules.id, id), eq(emailRules.userId, userId))).limit(1);
  if (!rule) throw notFound("Filter not found.");
  const rows = await db
    .select({
      id: messages.id,
      fromName: messages.fromName,
      fromAddress: messages.fromAddress,
      subject: messages.subject,
      text: sql<string>`left(${messages.textBody}, 100000)`,
      hasAttachments: messages.hasAttachments,
      listId: messages.listId,
    })
    .from(messages)
    .where(and(eq(messages.userId, userId), eq(messages.direction, "inbound"), inArray(messages.folder, ["inbox", "archive"])))
    .orderBy(sql`${messages.date} desc`)
    .limit(5000);
  if (rows.length === 0) return { matched: 0 };
  const recips = await db
    .select({ messageId: messageRecipients.messageId, name: messageRecipients.name, address: messageRecipients.address })
    .from(messageRecipients)
    .where(and(eq(messageRecipients.userId, userId), inArray(messageRecipients.messageId, rows.map((r) => r.id))));

  const matched = rows
    .filter((r) =>
      ruleMatches(rule, {
        from: `${r.fromName} ${r.fromAddress}`,
        to: recips.filter((x) => x.messageId === r.id).map((x) => `${x.name} ${x.address}`).join(", "),
        subject: r.subject,
        body: r.text,
        hasAttachment: r.hasAttachments,
        listId: r.listId ?? "",
      }),
    )
    .map((r) => r.id);
  if (matched.length === 0) return { matched: 0 };

  for (const a of rule.actions) {
    let action: ActionRequest["action"] | null = null;
    switch (a.type) {
      case "apply_label":
        action = { type: "add_label", labelId: a.labelId };
        break;
      case "mark_read":
        action = { type: "mark_read" };
        break;
      case "star":
        action = { type: "star" };
        break;
      case "archive":
        action = { type: "archive" };
        break;
      case "trash":
        action = { type: "trash" };
        break;
      case "mark_important":
        action = { type: "important" };
        break;
      case "set_category":
        action = { type: "set_category", category: a.category };
        break;
      case "mark_spam":
        action = { type: "spam" };
        break;
      case "never_spam":
        action = null;
        break;
    }
    if (!action) continue;
    for (let i = 0; i < matched.length; i += 500) {
      await applyAction(userId, { messageIds: matched.slice(i, i + 500), action });
    }
  }
  return { matched: matched.length };
}
