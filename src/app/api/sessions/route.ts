import { authed } from "@/lib/api/handler";
import { invalidateUserSessions } from "@/lib/auth/session-core";
import { recordSecurityEvent } from "@/lib/security-events";
import { listSessions } from "@/lib/services/account";

export const GET = authed(async ({ user, session }) => ({ sessions: await listSessions(user.id, session.id) }));

/** Signs out every other device. */
export const DELETE = authed(async ({ user, session, ip, userAgent }) => {
  const revoked = await invalidateUserSessions(user.id, session.id);
  await recordSecurityEvent("sessions_revoked", { userId: user.id, ip, userAgent, metadata: { count: revoked } });
  return { revoked };
});
