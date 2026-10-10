import { authed } from "@/lib/api/handler";
import { badRequest } from "@/lib/errors";
import { emptyFolder } from "@/lib/services/actions";

export const POST = authed<{ folder: string }>(async ({ params, user }) => {
  if (params.folder !== "trash" && params.folder !== "spam") throw badRequest("Only Trash and Spam can be emptied.");
  return { deleted: await emptyFolder(user.id, params.folder) };
});
