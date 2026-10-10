import { z } from "zod";
import { publicRoute, readJson } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { requestPasswordReset } from "@/lib/services/auth";
import { sha256Hex } from "@/lib/crypto";

const schema = z.object({ identifier: z.string().trim().min(1, "Enter your email address.").max(254) });

export const POST = publicRoute(async ({ req, ip, userAgent }) => {
  const { identifier } = await readJson(req, schema);
  await enforceRateLimit(`forgot:ip:${ip}`, 10, 3600);
  const allowed = await enforceRateLimit(`forgot:id:${sha256Hex(identifier.toLowerCase()).slice(0, 32)}`, 3, 3600).catch(() => null);
  if (allowed) {
    const { userId } = await requestPasswordReset(identifier);
    if (userId) await recordSecurityEvent("password_reset_requested", { userId, ip, userAgent });
  }
  // Identical response whether or not the account exists.
  return { ok: true };
});
