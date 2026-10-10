import { authed, readJson } from "@/lib/api/handler";
import { createRule, listRules, ruleInputSchema } from "@/lib/services/rules";

export const GET = authed(async ({ user }) => ({ rules: await listRules(user.id) }));
export const POST = authed(async ({ req, user }) => createRule(user.id, await readJson(req, ruleInputSchema)));
