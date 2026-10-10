import { authed } from "@/lib/api/handler";
import { retrySend } from "@/lib/services/compose";

export const POST = authed<{ id: string }>(async ({ params, user }) => retrySend(user.id, params.id));
