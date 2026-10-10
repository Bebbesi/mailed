import { z } from "zod";
import { publicRoute, readJson } from "@/lib/api/handler";
import { passwordSchema } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { resetPassword } from "@/lib/services/auth";

const schema = z.object({ token: z.string().min(10).max(128), password: passwordSchema });

export const POST = publicRoute(async ({ req, ip, userAgent }) => {
  await enforceRateLimit(`reset:ip:${ip}`, 10, 3600);
  const { token, password } = await readJson(req, schema);
  const user = await resetPassword(token, password);
  await recordSecurityEvent("password_reset", { userId: user.id, ip, userAgent });
  return { ok: true };
});
