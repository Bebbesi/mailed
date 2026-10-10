import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { senderLists } from "../db/schema";
import { notFound } from "../errors";

export const senderPatternSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .refine(
    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^@?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v),
    "Enter an email address or a domain such as example.com.",
  )
  .transform((v) => (v.includes("@") && !v.startsWith("@") ? v : `@${v.replace(/^@/, "")}`));

export const senderListInputSchema = z.object({
  kind: z.enum(["blocked", "trusted"]),
  pattern: senderPatternSchema,
});

export async function listSenderLists(userId: string) {
  const rows = await db.select().from(senderLists).where(eq(senderLists.userId, userId)).orderBy(desc(senderLists.createdAt));
  return rows.map((r) => ({ id: r.id, kind: r.kind, pattern: r.pattern, createdAt: r.createdAt.toISOString() }));
}

export async function upsertSenderList(userId: string, input: z.infer<typeof senderListInputSchema>) {
  const [row] = await db
    .insert(senderLists)
    .values({ userId, kind: input.kind, pattern: input.pattern })
    .onConflictDoUpdate({ target: [senderLists.userId, senderLists.pattern], set: { kind: input.kind } })
    .returning();
  return { id: row.id, kind: row.kind, pattern: row.pattern, createdAt: row.createdAt.toISOString() };
}

export async function deleteSenderList(userId: string, id: string) {
  const rows = await db.delete(senderLists).where(and(eq(senderLists.id, id), eq(senderLists.userId, userId))).returning({ id: senderLists.id });
  if (rows.length === 0) throw notFound("Entry not found.");
}
