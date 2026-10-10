import { authed, readQuery } from "@/lib/api/handler";
import { getThread } from "@/lib/services/mailbox";
import { toViewRef, viewQuerySchema } from "../view";

export const GET = authed<{ id: string }>(async ({ req, params, user }) => {
  const q = readQuery(req, viewQuerySchema);
  return getThread(user.id, params.id, toViewRef(q));
});
