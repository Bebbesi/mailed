import { authed, readJson } from "@/lib/api/handler";
import { createLabel, labelInputSchema, listLabels } from "@/lib/services/labels";

export const GET = authed(async ({ user }) => ({ labels: await listLabels(user.id) }));
export const POST = authed(async ({ req, user }) => createLabel(user.id, await readJson(req, labelInputSchema)));
