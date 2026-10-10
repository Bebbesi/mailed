import { authed } from "@/lib/api/handler";
import { readUpload } from "@/lib/api/upload";
import { badRequest } from "@/lib/errors";
import { enqueueJob } from "@/lib/jobs";
import { enforceRateLimit } from "@/lib/rate-limit";
import { storage, userPrefix } from "@/lib/storage";

const MAX_IMPORT = 100 * 1024 * 1024;

/** Accepts an .mbox or .eml upload and imports it in the background. */
export const POST = authed(async ({ req, user }) => {
  await enforceRateLimit(`import:${user.id}`, 10, 86400);
  const file = await readUpload(req, "file", MAX_IMPORT);
  const name = file.name.toLowerCase();
  if (!name.endsWith(".mbox") && !name.endsWith(".eml") && !name.endsWith(".mbx")) {
    throw badRequest("Upload an .mbox or .eml file.");
  }
  const head = file.data.subarray(0, 2048).toString("latin1");
  if (!/^(From |Return-Path:|Received:|[A-Za-z-]+: )/m.test(head)) throw badRequest("The file does not look like email.");
  const folder = file.form.get("folder") === "inbox" ? "inbox" : "archive";
  const key = `${userPrefix(user.id)}imports/${crypto.randomUUID()}`;
  await storage().put(key, file.data, "application/mbox");
  await enqueueJob("import_mailbox", { userId: user.id, key, folder }, { maxAttempts: 1 });
  return { queued: true };
});
