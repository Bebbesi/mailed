import { authed, readJson } from "@/lib/api/handler";
import { sendDraft, sendSchema } from "@/lib/services/compose";

export const POST = authed<{ id: string }>(async ({ req, params, user }) => sendDraft(user.id, params.id, await readJson(req, sendSchema)));
