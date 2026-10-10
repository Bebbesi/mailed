import { z } from "zod";
import { authed, readJson } from "@/lib/api/handler";
import { markNotificationsRead } from "@/lib/services/notifications";

export const POST = authed(async ({ req, user }) => {
  const { ids } = await readJson(req, z.object({ ids: z.array(z.string().uuid()).max(200).optional() }));
  await markNotificationsRead(user.id, ids);
  return { ok: true };
});
