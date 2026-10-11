import { authed, readJson } from "@/lib/api/handler";
import { createPasswordAccount, linkedAccountCreateSchema, listLinkedAccounts } from "@/lib/services/linked-accounts";

export const GET = authed(async ({ user }) => listLinkedAccounts(user.id));

/** Links an account with a password or app password; the login is tested first. */
export const POST = authed(async ({ req, user }) => createPasswordAccount(user.id, await readJson(req, linkedAccountCreateSchema)));
