import { publicRoute } from "@/lib/api/handler";
import { clearSessionCookie } from "@/lib/auth/session";
import { invalidateSession } from "@/lib/auth/session-core";
import { recordSecurityEvent } from "@/lib/security-events";

export const POST = publicRoute(async ({ auth, ip, userAgent }) => {
  if (auth) {
    await invalidateSession(auth.session.id);
    await recordSecurityEvent("logout", { userId: auth.user.id, ip, userAgent });
  }
  await clearSessionCookie();
  return { ok: true };
});
