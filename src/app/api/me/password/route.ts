import { z } from "zod";
import { authed, readJson } from "@/lib/api/handler";
import { passwordSchema } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { changePassword } from "@/lib/services/auth";

const schema = z.object({ currentPassword: z.string().min(1, "Enter your current password."), newPassword: passwordSchema });

export const POST = authed(async ({ req, user, session, ip, userAgent }) => {
  await enforceRateLimit(`change-password:${user.id}`, 10, 3600);
  const { currentPassword, newPassword } = await readJson(req, schema);
  const revoked = await changePassword(user.id, currentPassword, newPassword, session.id);
  await recordSecurityEvent("password_changed", { userId: user.id, ip, userAgent, metadata: { revokedSessions: revoked } });
  return { ok: true, revokedSessions: revoked };
});
