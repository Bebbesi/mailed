import { authed, readJson } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createDraft, draftCreateSchema } from "@/lib/services/compose";

export const POST = authed(async ({ req, user }) => {
  await enforceRateLimit(`draft-create:${user.id}`, 120, 3600);
  return createDraft(user.id, await readJson(req, draftCreateSchema));
});
