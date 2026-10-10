import { authed, readJson } from "@/lib/api/handler";
import { deleteRule, ruleInputSchema, updateRule } from "@/lib/services/rules";

export const PUT = authed<{ id: string }>(async ({ req, params, user }) => updateRule(user.id, params.id, await readJson(req, ruleInputSchema)));
export const DELETE = authed<{ id: string }>(async ({ params, user }) => {
  await deleteRule(user.id, params.id);
  return { ok: true };
});
