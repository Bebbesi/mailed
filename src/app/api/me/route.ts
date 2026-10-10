import { z } from "zod";
import { authed, readJson } from "@/lib/api/handler";
import { clearSessionCookie } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { getMe, profileSchema, updateProfile } from "@/lib/services/account";
import { deleteAccount } from "@/lib/services/auth";

export const GET = authed(async ({ user }) => getMe(user.id));

export const PATCH = authed(async ({ req, user, ip, userAgent }) => {
  const input = await readJson(req, profileSchema);
  const me = await updateProfile(user.id, input);
  await recordSecurityEvent("profile_updated", { userId: user.id, ip, userAgent });
  return me;
});

const deleteSchema = z.object({
  password: z.string().min(1, "Enter your password."),
  confirm: z.literal("DELETE", { message: 'Type "DELETE" to confirm.' }),
});

export const DELETE = authed(async ({ req, user, ip, userAgent }) => {
  await enforceRateLimit(`delete-account:${user.id}`, 5, 3600);
  const { password } = await readJson(req, deleteSchema);
  await deleteAccount(user.id, password);
  await recordSecurityEvent("account_deleted", { userId: user.id, ip, userAgent });
  await clearSessionCookie();
  return { ok: true };
});
