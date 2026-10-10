import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { contacts, messageRecipients, messages } from "../db/schema";
import { conflict, notFound, isUniqueViolation } from "../errors";
import { normalizeAddress } from "../mail/address";
import type { ContactDTO } from "../types";

export const contactInputSchema = z.object({
  name: z.string().trim().max(120).default(""),
  address: z.string().trim().toLowerCase().email("Enter a valid email address.").max(254),
  isFavorite: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

const toDTO = (c: typeof contacts.$inferSelect): ContactDTO => ({
  id: c.id,
  name: c.name,
  address: c.address,
  isFavorite: c.isFavorite,
  interactionCount: c.interactionCount,
  lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
  source: c.source,
  notes: c.notes,
});

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listContacts(userId: string, opts: { q?: string; favorites?: boolean; limit?: number; offset?: number }) {
  const conds = [eq(contacts.userId, userId)];
  if (opts.q) conds.push(or(ilike(contacts.name, like(opts.q)), ilike(contacts.address, like(opts.q)))!);
  if (opts.favorites) conds.push(eq(contacts.isFavorite, true));
  const rows = await db
    .select()
    .from(contacts)
    .where(and(...conds))
    .orderBy(desc(contacts.isFavorite), asc(sql`lower(coalesce(nullif(${contacts.name}, ''), ${contacts.address}))`))
    .limit(Math.min(opts.limit ?? 100, 500))
    .offset(opts.offset ?? 0);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(contacts).where(and(...conds));
  return { contacts: rows.map(toDTO), total };
}

/** Address suggestions for the composer: saved contacts first, ranked by use. */
export async function suggestContacts(userId: string, q: string, limit = 8) {
  const term = q.trim().toLowerCase();
  if (!term) {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, userId))
      .orderBy(desc(contacts.isFavorite), desc(contacts.interactionCount), desc(contacts.lastInteractionAt))
      .limit(limit);
    return rows.map(toDTO);
  }
  const rows = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.userId, userId), or(ilike(contacts.name, like(term)), ilike(contacts.address, like(term)))))
    .orderBy(
      desc(sql`(${contacts.address} like ${`${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`})`),
      desc(contacts.isFavorite),
      desc(contacts.interactionCount),
    )
    .limit(limit);
  if (rows.length >= limit) return rows.map(toDTO);
  // Fall back to people who wrote to the user but were never saved.
  const senders = await db
    .selectDistinctOn([messages.fromAddress], { name: messages.fromName, address: messages.fromAddress })
    .from(messages)
    .where(
      and(
        eq(messages.userId, userId),
        eq(messages.direction, "inbound"),
        sql`${messages.folder} not in ('spam', 'trash')`,
        or(ilike(messages.fromAddress, like(term)), ilike(messages.fromName, like(term))),
      ),
    )
    .limit(limit);
  const seen = new Set(rows.map((r) => r.address));
  const extra = senders
    .filter((s) => s.address && !seen.has(s.address))
    .slice(0, limit - rows.length)
    .map((s) => ({ id: "", name: s.name, address: s.address, isFavorite: false, interactionCount: 0, lastInteractionAt: null, source: "history", notes: "" }));
  return [...rows.map(toDTO), ...extra];
}

export async function createContact(userId: string, input: z.infer<typeof contactInputSchema>) {
  try {
    const [row] = await db
      .insert(contacts)
      .values({ userId, name: input.name, address: input.address, isFavorite: input.isFavorite ?? false, notes: input.notes ?? "", source: "manual" })
      .returning();
    return toDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("This contact already exists.", { field: "address" });
    throw err;
  }
}

export async function updateContact(userId: string, id: string, input: Partial<z.infer<typeof contactInputSchema>>) {
  try {
    const [row] = await db
      .update(contacts)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), eq(contacts.userId, userId)))
      .returning();
    if (!row) throw notFound("Contact not found.");
    return toDTO(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("Another contact uses this address.", { field: "address" });
    throw err;
  }
}

export async function deleteContact(userId: string, id: string) {
  const rows = await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.userId, userId))).returning({ id: contacts.id });
  if (rows.length === 0) throw notFound("Contact not found.");
}

/** Saves everyone the user writes to, so they show up as suggestions. */
export async function recordOutgoingContacts(userId: string, people: { name: string; address: string }[]) {
  const unique = new Map<string, string>();
  for (const p of people) unique.set(normalizeAddress(p.address), p.name);
  if (unique.size === 0) return;
  const now = new Date();
  await db
    .insert(contacts)
    .values([...unique].map(([address, name]) => ({ userId, address, name, interactionCount: 1, lastInteractionAt: now, source: "auto" as const })))
    .onConflictDoUpdate({
      target: [contacts.userId, contacts.address],
      set: {
        interactionCount: sql`${contacts.interactionCount} + 1`,
        lastInteractionAt: now,
        name: sql`case when ${contacts.name} = '' then excluded.name else ${contacts.name} end`,
        updatedAt: now,
      },
    });
}

export async function recentRecipients(userId: string, limit = 10) {
  return db
    .selectDistinctOn([messageRecipients.address], { address: messageRecipients.address, name: messageRecipients.name })
    .from(messageRecipients)
    .innerJoin(messages, eq(messages.id, messageRecipients.messageId))
    .where(and(eq(messageRecipients.userId, userId), eq(messages.direction, "outbound")))
    .limit(limit);
}
