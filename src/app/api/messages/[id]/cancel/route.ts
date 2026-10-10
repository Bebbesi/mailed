import { authed } from "@/lib/api/handler";
import { cancelSend } from "@/lib/services/compose";

export const POST = authed<{ id: string }>(async ({ params, user }) => cancelSend(user.id, params.id));
