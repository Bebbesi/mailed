import { authed, readQuery } from "@/lib/api/handler";
import { listThreads } from "@/lib/services/mailbox";
import { getSettings } from "@/lib/services/settings";
import { toViewRef, viewQuerySchema } from "./view";

export const GET = authed(async ({ req, user }) => {
  const q = readQuery(req, viewQuerySchema);
  const settings = await getSettings(user.id);
  return listThreads(user.id, toViewRef(q), {
    inboxCategories: settings.inboxCategories,
    cursor: q.cursor,
    filter: q.filter,
    limit: q.limit ?? settings.pageSize,
  });
});
