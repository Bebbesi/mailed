import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ingestRawMessage, IngestError } from "@/lib/mail/ingest";
import { hitRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

/**
 * Generic inbound webhook: the body is the raw RFC 5322 message.
 *
 * Headers:
 *   X-Mailed-Timestamp: unix seconds (must be within 5 minutes)
 *   X-Mailed-Signature: hex HMAC-SHA256 of `${timestamp}.${body}` with INBOUND_WEBHOOK_SECRET
 *   X-Mailed-Envelope-To: comma-separated envelope recipients (recommended)
 *   X-Mailed-Envelope-From: envelope sender (optional)
 *
 * See docs/EMAIL_PROVIDER.md for a Cloudflare Email Worker that calls this.
 */
export async function POST(req: NextRequest) {
  const secret = env().INBOUND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Inbound webhook is not configured" }, { status: 404 });
  const ip = clientIp(req.headers);
  const rl = await hitRateLimit(`inbound-webhook:${ip}`, 2000, 3600);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const declared = Number(req.headers.get("content-length") ?? 0);
  const max = env().MAX_MESSAGE_SIZE_MB * 1024 * 1024 * 1.4;
  if (declared > max) return NextResponse.json({ error: "Message too large", permanent: true }, { status: 413 });

  const body = Buffer.from(await req.arrayBuffer());
  const ts = req.headers.get("x-mailed-timestamp") ?? "";
  const sig = (req.headers.get("x-mailed-signature") ?? "").replace(/^sha256=/, "");
  const age = Math.abs(Date.now() / 1000 - Number(ts));
  const expected = hmacHex(secret, Buffer.concat([Buffer.from(`${ts}.`), body]));
  if (!ts || !Number.isFinite(age) || age > 300 || !safeEqual(expected, sig)) {
    logger.warn({ ip }, "inbound webhook signature rejected");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const rcpt = (req.headers.get("x-mailed-envelope-to") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const outcome = await ingestRawMessage(body, {
      source: "webhook",
      envelope: { rcptTo: rcpt.length ? rcpt : undefined, mailFrom: req.headers.get("x-mailed-envelope-from") },
    });
    return NextResponse.json({ delivered: outcome.delivered.length, rejected: outcome.rejected });
  } catch (err) {
    if (err instanceof IngestError && err.permanent) {
      return NextResponse.json({ error: err.message, code: err.code, permanent: true }, { status: 422 });
    }
    logger.error({ err }, "inbound webhook processing failed");
    return NextResponse.json({ error: "Temporary failure" }, { status: 503 });
  }
}
