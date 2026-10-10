import { z } from "zod";
import { authed, readJson } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { updateRecoveryEmail } from "@/lib/services/auth";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address.").max(254), password: z.string().min(1) });

export const POST = authed(async ({ req, user, ip, userAgent }) => {
  await enforceRateLimit(`recovery-email:${user.id}`, 5, 3600);
  const { email, password } = await readJson(req, schema);
  const res = await updateRecoveryEmail(user.id, email, password);
  await recordSecurityEvent("profile_updated", { userId: user.id, ip, userAgent, metadata: { field: "recoveryEmail" } });
  return res;
});
