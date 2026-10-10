import { authed } from "@/lib/api/handler";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordSecurityEvent } from "@/lib/security-events";
import { exportAccountJson } from "@/lib/services/data-transfer";

export const GET = authed(async ({ user, ip, userAgent }) => {
  await enforceRateLimit(`export:${user.id}`, 20, 3600);
  const data = await exportAccountJson(user.id);
  await recordSecurityEvent("data_exported", { userId: user.id, ip, userAgent, metadata: { kind: "account" } });
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mailed-account-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
