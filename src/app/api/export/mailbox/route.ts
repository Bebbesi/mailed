import { authed } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { exportMailboxStream } from "@/lib/services/data-transfer";

export const dynamic = "force-dynamic";

export const GET = authed(async ({ user, ip, userAgent }) => {
  await enforceRateLimit(`export:${user.id}`, 20, 3600);
  await recordSecurityEvent("data_exported", { userId: user.id, ip, userAgent, metadata: { kind: "mailbox" } });
  return new Response(exportMailboxStream(user.id), {
    headers: {
      "Content-Type": "application/mbox",
      "Content-Disposition": `attachment; filename="mailed-${new Date().toISOString().slice(0, 10)}.mbox"`,
      "Cache-Control": "no-store",
    },
  });
});
