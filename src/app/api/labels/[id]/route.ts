import { authed, readJson } from "@/lib/api/handler";
import { deleteLabel, labelInputSchema, updateLabel } from "@/lib/services/labels";

export const PATCH = authed<{ id: string }>(async ({ req, params, user }) =>
  updateLabel(user.id, params.id, await readJson(req, labelInputSchema.partial())),
);
export const DELETE = authed<{ id: string }>(async ({ params, user }) => {
  await deleteLabel(user.id, params.id);
  return { ok: true };
});
