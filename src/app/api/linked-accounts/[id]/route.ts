import { authed, readJson } from "@/lib/api/handler";
import { linkedAccountPatchSchema, removeLinkedAccount, updateLinkedAccount } from "@/lib/services/linked-accounts";

export const PATCH = authed<{ id: string }>(async ({ req, params, user }) =>
  updateLinkedAccount(user.id, params.id, await readJson(req, linkedAccountPatchSchema)),
);

/** `?deleteMail=1` also deletes the mail fetched from the account and its label. */
export const DELETE = authed<{ id: string }>(async ({ req, params, user }) =>
  removeLinkedAccount(user.id, params.id, { deleteMail: req.nextUrl.searchParams.get("deleteMail") === "1" }),
);
