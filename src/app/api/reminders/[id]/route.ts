import { authed } from "@/lib/api/handler";
import { deleteReminder } from "@/lib/services/reminders";

export const DELETE = authed<{ id: string }>(async ({ params, user }) => {
  await deleteReminder(user.id, params.id);
  return { ok: true };
});
