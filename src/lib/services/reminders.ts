import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { reminders } from "../db/schema";
import { badRequest, notFound } from "../errors";
import { getOwnedMessage } from "./mailbox";

export const reminderInputSchema = z.object({
  messageId: z.string().uuid(),
  remindAt: z.string().datetime(),
  onlyIfNoReply: z.boolean().default(false),
  note: z.string().max(300).default(""),
});

export async function createReminder(userId: string, input: z.infer<typeof reminderInputSchema>) {
  const m = await getOwnedMessage(userId, input.messageId);
  const at = new Date(input.remindAt);
  if (at.getTime() < Date.now() + 30_000) throw badRequest("Choose a time in the future.");
  if (at.getTime() > Date.now() + 366 * 86400_000) throw badRequest("Choose a time within a year.");
  // One active reminder per message.
  await db.delete(reminders).where(and(eq(reminders.userId, userId), eq(reminders.messageId, m.id), isNull(reminders.firedAt)));
  const [row] = await db
    .insert(reminders)
    .values({ userId, messageId: m.id, threadId: m.threadId, remindAt: at, onlyIfNoReply: input.onlyIfNoReply, note: input.note })
    .returning();
  return { id: row.id, remindAt: row.remindAt.toISOString(), onlyIfNoReply: row.onlyIfNoReply };
}

export async function deleteReminder(userId: string, id: string) {
  const rows = await db.delete(reminders).where(and(eq(reminders.id, id), eq(reminders.userId, userId))).returning({ id: reminders.id });
  if (rows.length === 0) throw notFound("Reminder not found.");
}
