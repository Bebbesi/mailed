import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../db";
import { classifierStats, classifierTokens } from "../db/schema";

export type BayesInput = {
  subject: string;
  text: string;
  fromAddress: string;
  linkDomains: string[];
  flags: string[];
};

const MAX_TOKENS = 400;
const MIN_DOCS = 5;

/** Bag of unique, prefixed tokens that describe a message for the per-user model. */
export function tokenize(input: BayesInput): string[] {
  const tokens = new Set<string>();
  const words = (s: string, prefix: string, limit: number) => {
    const re = /[\p{L}\p{N}][\p{L}\p{N}'’$€%-]{2,23}/gu;
    let m: RegExpExecArray | null;
    let n = 0;
    const lower = s.toLowerCase();
    while ((m = re.exec(lower)) && n < limit) {
      tokens.add(prefix + m[0]);
      n++;
    }
  };
  words(input.subject, "s:", 40);
  words(input.text.slice(0, 20_000), "", 2000);
  const from = input.fromAddress.toLowerCase();
  if (from) {
    tokens.add(`f:${from}`);
    tokens.add(`fd:${from.split("@")[1] ?? ""}`);
  }
  for (const d of input.linkDomains.slice(0, 30)) tokens.add(`ld:${d}`);
  for (const f of input.flags) tokens.add(`h:${f}`);
  return [...tokens].slice(0, MAX_TOKENS);
}

/**
 * Robinson-style naive Bayes. Returns log-odds of spam from the user's own
 * corrections, or null while the model has too little training data.
 */
export async function bayesLogOdds(userId: string, tokens: string[], conn: DbOrTx = db) {
  const [stats] = await conn.select().from(classifierStats).where(eq(classifierStats.userId, userId)).limit(1);
  if (!stats || stats.spamDocs < MIN_DOCS || stats.hamDocs < MIN_DOCS || tokens.length === 0) return null;

  const rows = await conn
    .select({ token: classifierTokens.token, spam: classifierTokens.spamCount, ham: classifierTokens.hamCount })
    .from(classifierTokens)
    .where(and(eq(classifierTokens.userId, userId), inArray(classifierTokens.token, tokens)));

  const s = 1;
  const x = 0.5;
  const probs = rows
    .map((r) => {
      const spamFreq = r.spam / stats.spamDocs;
      const hamFreq = r.ham / stats.hamDocs;
      if (spamFreq + hamFreq === 0) return null;
      const p = spamFreq / (spamFreq + hamFreq);
      const n = r.spam + r.ham;
      const f = (s * x + n * p) / (s + n);
      return Math.min(0.99, Math.max(0.01, f));
    })
    .filter((p): p is number => p !== null)
    .sort((a, b) => Math.abs(b - 0.5) - Math.abs(a - 0.5))
    .slice(0, 30);

  if (probs.length < 3) return null;
  const logOdds = probs.reduce((acc, p) => acc + Math.log(p / (1 - p)), 0);
  return { logOdds: Math.max(-6, Math.min(6, logOdds / Math.sqrt(probs.length))), used: probs.length };
}

/**
 * Updates the user's model after a correction. When the message had been
 * trained as the opposite class before, that contribution is reversed first.
 */
export async function trainBayes(
  userId: string,
  tokens: string[],
  label: "spam" | "ham",
  previous: "spam" | "ham" | null | undefined,
  conn: DbOrTx = db,
) {
  if (tokens.length === 0 || previous === label) return;
  const spamDelta = (label === "spam" ? 1 : 0) - (previous === "spam" ? 1 : 0);
  const hamDelta = (label === "ham" ? 1 : 0) - (previous === "ham" ? 1 : 0);

  await conn
    .insert(classifierTokens)
    .values(tokens.map((token) => ({ userId, token, spamCount: Math.max(0, spamDelta), hamCount: Math.max(0, hamDelta) })))
    .onConflictDoUpdate({
      target: [classifierTokens.userId, classifierTokens.token],
      set: {
        spamCount: sql`greatest(0, ${classifierTokens.spamCount} + ${spamDelta})`,
        hamCount: sql`greatest(0, ${classifierTokens.hamCount} + ${hamDelta})`,
      },
    });

  await conn
    .insert(classifierStats)
    .values({ userId, spamDocs: Math.max(0, spamDelta), hamDocs: Math.max(0, hamDelta) })
    .onConflictDoUpdate({
      target: classifierStats.userId,
      set: {
        spamDocs: sql`greatest(0, ${classifierStats.spamDocs} + ${spamDelta})`,
        hamDocs: sql`greatest(0, ${classifierStats.hamDocs} + ${hamDelta})`,
        updatedAt: new Date(),
      },
    });
}
