import { authed } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resendVerification } from "@/lib/services/auth";

export const POST = authed(async ({ user }) => {
  await enforceRateLimit(`verify-resend:${user.id}`, 3, 3600, "You already requested several emails. Try again in an hour.");
  return resendVerification(user.id);
});
