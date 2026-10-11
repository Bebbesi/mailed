import { authed } from "@/lib/api/handler";
import { requestLinkedSync } from "@/lib/services/linked-accounts";

/** Asks the worker to check the account for new mail now. */
export const POST = authed<{ id: string }>(async ({ params, user }) => requestLinkedSync(user.id, params.id));
