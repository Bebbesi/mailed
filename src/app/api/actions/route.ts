import { authed, readJson } from "@/lib/api/handler";
import { actionSchema, applyAction } from "@/lib/services/actions";

export const POST = authed(async ({ req, user }) => applyAction(user.id, await readJson(req, actionSchema)));
