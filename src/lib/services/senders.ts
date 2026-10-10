import { and, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "../db";
import { contacts, domainReputation, senderCategories, senderLists, type Category } from "../db/schema";
import { domainOf, registrableDomain } from "../mail/address";

/** Candidate patterns for a sender, most specific first. */
export function senderPatterns(address: string): string[] {
  const domain = domainOf(address);
  const reg = registrableDomain(domain);
  return [...new Set([address.toLowerCase(), `@${domain}`, `@${reg}`])];
}

export async function senderListStatus(userId: string, address: string, conn: DbOrTx = db) {
  const patterns = senderPatterns(address);
  const rows = await conn
    .select({ kind: senderLists.kind, pattern: senderLists.pattern })
    .from(senderLists)
    .where(and(eq(senderLists.userId, userId), inArray(senderLists.pattern, patterns)));
  for (const p of patterns) {
    const hit = rows.find((r) => r.pattern === p);
    if (hit) return hit.kind;
  }
  return null;
}

export async function senderCategoryOverride(userId: string, address: string, conn: DbOrTx = db): Promise<Category | null> {
  const patterns = senderPatterns(address);
  const rows = await conn
    .select()
    .from(senderCategories)
    .where(and(eq(senderCategories.userId, userId), inArray(senderCategories.pattern, patterns)));
  for (const p of patterns) {
    const hit = rows.find((r) => r.pattern === p);
    if (hit) return hit.category;
  }
  return null;
}

export async function senderRelationship(userId: string, address: string, conn: DbOrTx = db) {
  const [row] = await conn
    .select({ interactions: contacts.interactionCount })
    .from(contacts)
    .where(and(eq(contacts.userId, userId), eq(contacts.address, address.toLowerCase())))
    .limit(1);
  return { known: Boolean(row), interactions: row?.interactions ?? 0 };
}

export async function getDomainReputation(domain: string, conn: DbOrTx = db) {
  const [row] = await conn.select().from(domainReputation).where(eq(domainReputation.domain, domain)).limit(1);
  return row ?? null;
}
