import { authed } from "@/lib/api/handler";
import { validateSessionToken } from "@/lib/auth/session-core";
import { subscribeUser } from "@/lib/realtime";
import type { MailboxEvent } from "@/lib/events";
import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Server-sent events: new mail, send status and notifications for the signed-in
 * user. The session is re-checked on every heartbeat, so revoking a session
 * also closes its stream.
 */
export const GET = authed(async ({ req, user }) => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup?.();
        }
      };
      const unsubscribe = await subscribeUser(user.id, (e: MailboxEvent) => send(e.type, e));
      send("ready", { at: new Date().toISOString() });

      const heartbeat = setInterval(async () => {
        const valid = await validateSessionToken(token).catch(() => null);
        if (!valid) {
          send("session.expired", {});
          cleanup?.();
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup?.();
        }
      }, 25_000);

      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        cleanup = null;
      };
      req.signal.addEventListener("abort", () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
