import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { authTokens } from "../db/schema";
import { randomToken, sha256Hex } from "../crypto";

type TokenType = (typeof authTokens.$inferSelect)["type"];

const TTL: Record<TokenType, number> = {
  verify_email: 48 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
};

/** Creates a single-use token, invalidating any earlier unused token of the same type. */
export async function issueAuthToken(userId: string, type: TokenType, email: string): Promise<string> {
  const token = randomToken(32);
  await db.transaction(async (tx) => {
    await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
    await tx.insert(authTokens).values({
      id: sha256Hex(token),
      userId,
      type,
      email,
      expiresAt: new Date(Date.now() + TTL[type]),
    });
  });
  return token;
}

/** Atomically marks a token as used and returns it, or null when invalid/expired/used. */
export async function consumeAuthToken(token: string, type: TokenType) {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.id, sha256Hex(token)),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  return row ?? null;
}

/** Checks a token without consuming it (used to render the reset form). */
export async function peekAuthToken(token: string, type: TokenType) {
  if (!token || token.length > 128) return null;
  const [row] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.id, sha256Hex(token)),
        eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
