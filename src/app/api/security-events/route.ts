import { authed } from "@/lib/api/handler";
import { listSecurityEvents } from "@/lib/services/account";

export const GET = authed(async ({ user }) => ({ events: await listSecurityEvents(user.id) }));
