import { authed, readJson } from "@/lib/api/handler";
import { listSenderLists, senderListInputSchema, upsertSenderList } from "@/lib/services/sender-lists";

export const GET = authed(async ({ user }) => ({ entries: await listSenderLists(user.id) }));
export const POST = authed(async ({ req, user }) => upsertSenderList(user.id, await readJson(req, senderListInputSchema)));
