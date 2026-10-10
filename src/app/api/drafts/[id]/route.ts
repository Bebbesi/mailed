import { authed, readJson } from "@/lib/api/handler";
import { discardDraft, draftPatchSchema, getDraft, updateDraft } from "@/lib/services/compose";

export const GET = authed<{ id: string }>(async ({ params, user }) => getDraft(user.id, params.id));

export const PATCH = authed<{ id: string }>(async ({ req, params, user }) => updateDraft(user.id, params.id, await readJson(req, draftPatchSchema)));

export const DELETE = authed<{ id: string }>(async ({ params, user }) => {
  await discardDraft(user.id, params.id);
  return { ok: true };
});
