import { z } from "zod";
import { authed, readQuery } from "@/lib/api/handler";
import { suggestContacts } from "@/lib/services/contacts";

export const GET = authed(async ({ req, user }) => {
  const { q } = readQuery(req, z.object({ q: z.string().max(200).default("") }));
  return { suggestions: await suggestContacts(user.id, q) };
});
