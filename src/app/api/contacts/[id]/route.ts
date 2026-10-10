import { authed, readJson } from "@/lib/api/handler";
import { contactInputSchema, deleteContact, updateContact } from "@/lib/services/contacts";

export const PATCH = authed<{ id: string }>(async ({ req, params, user }) =>
  updateContact(user.id, params.id, await readJson(req, contactInputSchema.partial())),
);
export const DELETE = authed<{ id: string }>(async ({ params, user }) => {
  await deleteContact(user.id, params.id);
  return { ok: true };
});
