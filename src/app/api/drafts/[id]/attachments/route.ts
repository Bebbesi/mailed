import { authed } from "@/lib/api/handler";
import { readUpload } from "@/lib/api/upload";
import { enforceRateLimit } from "@/lib/rate-limit";
import { addDraftAttachment, MAX_FILE_BYTES } from "@/lib/services/attachments";

export const POST = authed<{ id: string }>(async ({ req, params, user }) => {
  await enforceRateLimit(`upload:${user.id}`, 200, 3600);
  const file = await readUpload(req, "file", MAX_FILE_BYTES);
  return addDraftAttachment(user.id, params.id, file);
});
