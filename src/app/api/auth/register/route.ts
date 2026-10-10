import { publicRoute, readJson } from "@/lib/api/handler";
import { createSession } from "@/lib/auth/session-core";
import { setSessionCookie } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { registerSchema, registerUser } from "@/lib/services/auth";

export const POST = publicRoute(async ({ req, ip, userAgent }) => {
  await enforceRateLimit(`register:ip:${ip}`, 5, 3600, "Too many accounts created from this network. Try again later.");
  const input = await readJson(req, registerSchema);
  const { user, verificationSent } = await registerUser(input);
  const { token, session } = await createSession(user.id, { ip, userAgent });
  await setSessionCookie(token, session.expiresAt);
  await recordSecurityEvent("register", { userId: user.id, ip, userAgent });
  return { ok: true, address: user.address, verificationSent };
});
