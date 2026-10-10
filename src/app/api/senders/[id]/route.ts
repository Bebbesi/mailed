import { authed } from "@/lib/api/handler";
import { deleteSenderList } from "@/lib/services/sender-lists";

export const DELETE = authed<{ id: string }>(async ({ params, user }) => {
  await deleteSenderList(user.id, params.id);
  return { ok: true };
});
