import { z } from "zod";
import { authed, readJson, readQuery } from "@/lib/api/handler";
import { contactInputSchema, createContact, listContacts } from "@/lib/services/contacts";

const query = z.object({
  q: z.string().max(200).optional(),
  favorites: z.enum(["1", "0"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const GET = authed(async ({ req, user }) => {
  const q = readQuery(req, query);
  return listContacts(user.id, { q: q.q, favorites: q.favorites === "1", limit: q.limit, offset: q.offset });
});

export const POST = authed(async ({ req, user }) => createContact(user.id, await readJson(req, contactInputSchema)));
