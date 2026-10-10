import { authed } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { applyRuleToExisting } from "@/lib/services/rules";

export const POST = authed<{ id: string }>(async ({ params, user }) => {
  await enforceRateLimit(`rule-apply:${user.id}`, 20, 3600);
  return applyRuleToExisting(user.id, params.id);
});
