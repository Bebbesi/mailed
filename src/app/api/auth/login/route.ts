import { z } from "zod";
import { publicRoute, readJson } from "@/lib/api/handler";
import { createSession } from "@/lib/auth/session-core";
import { setSessionCookie } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { authenticate } from "@/lib/services/auth";
import { sha256Hex } from "@/lib/crypto";

const schema = z.object({
  identifier: z.string().trim().min(1, "Enter your email address.").max(254),
  password: z.string().min(1, "Enter your password.").max(256),
});

export const POST = publicRoute(async ({ req, ip, userAgent }) => {
  const { identifier, password } = await readJson(req, schema);
  const idKey = sha256Hex(identifier.toLowerCase()).slice(0, 32);
  await enforceRateLimit(`login:ip:${ip}`, 30, 900, "Too many sign-in attempts. Wait a few minutes and try again.");
  await enforceRateLimit(`login:id:${idKey}`, 10, 900, "Too many sign-in attempts for this account. Wait a few minutes and try again.");

  const user = await authenticate(identifier, password);
  if (!user) {
    await recordSecurityEvent("login_failed", { ip, userAgent, metadata: { identifier: idKey } });
    throw new AppError(401, "invalid_credentials", "The email or password is incorrect.");
  }
  const { token, session } = await createSession(user.id, { ip, userAgent });
  await setSessionCookie(token, session.expiresAt);
  await recordSecurityEvent("login", { userId: user.id, ip, userAgent });
  return { ok: true };
});
