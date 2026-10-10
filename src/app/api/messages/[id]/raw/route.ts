import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/errors";
import { getOwnedMessage } from "@/lib/services/mailbox";
import { contentDisposition, storage } from "@/lib/storage";

/** Downloads the original RFC 5322 source ("Show original"). */
export const GET = authed<{ id: string }>(async ({ params, user }) => {
  const m = await getOwnedMessage(user.id, params.id);
  if (!m.rawKey) throw notFound("The original message is not available.");
  const data = await storage().get(m.rawKey);
  const name = `${(m.subject || "message").replace(/[^\p{L}\p{N} _.-]+/gu, "").slice(0, 60).trim() || "message"}.eml`;
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": contentDisposition("attachment", name),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
