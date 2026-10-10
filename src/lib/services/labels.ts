import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { labels } from "../db/schema";
import { conflict, notFound, isUniqueViolation } from "../errors";
import { LABEL_COLORS, type LabelDTO } from "../types";

export const labelInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name.")
    .max(50, "Use at most 50 characters.")
    .refine((v) => !/[\u0000-\u001f]/.test(v), "Invalid characters."),
  color: z.enum(LABEL_COLORS).default("slate"),
});

const toDTO = (l: typeof labels.$inferSelect): LabelDTO => ({ id: l.id, name: l.name, color: l.color });

export async function listLabels(userId: string) {
  const rows = await db.select().from(labels).where(eq(labels.userId, userId)).orderBy(asc(labels.name));
  return rows.map(toDTO);
}

export async function createLabel(userId: string, input: z.infer<typeof labelInputSchema>) {
  const count = await db.$count(labels, eq(labels.userId, userId));
  if (count >= 200) throw conflict("You can create up to 200 labels.");
  try {
    const [row] = await db.insert(labels).values({ userId, name: input.name, color: input.color }).returning();
    return toDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("A label with this name already exists.", { field: "name" });
    throw err;
  }
}

export async function updateLabel(userId: string, id: string, input: Partial<z.infer<typeof labelInputSchema>>) {
  try {
    const [row] = await db.update(labels).set(input).where(and(eq(labels.id, id), eq(labels.userId, userId))).returning();
    if (!row) throw notFound("Label not found.");
    return toDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("A label with this name already exists.", { field: "name" });
    throw err;
  }
}

export async function deleteLabel(userId: string, id: string) {
  const rows = await db.delete(labels).where(and(eq(labels.id, id), eq(labels.userId, userId))).returning({ id: labels.id });
  if (rows.length === 0) throw notFound("Label not found.");
}
