import { authed } from "@/lib/api/handler";
import { mailboxCounts } from "@/lib/services/mailbox";
import { getSettings } from "@/lib/services/settings";

export const GET = authed(async ({ user }) => {
  const settings = await getSettings(user.id);
  return mailboxCounts(user.id, { inboxCategories: settings.inboxCategories });
});
