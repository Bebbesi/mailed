import { authed } from "@/lib/api/handler";
import { recordSecurityEvent } from "@/lib/security-events";
import { revokeSession } from "@/lib/services/account";

export const DELETE = authed<{ id: string }>(async ({ params, user, session, ip, userAgent }) => {
  await revokeSession(user.id, params.id, session.id);
  await recordSecurityEvent("session_revoked", { userId: user.id, ip, userAgent });
  return { ok: true };
});
