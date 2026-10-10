import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { hmacHex, safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { ingestRawMessage, IngestError } from "@/lib/mail/ingest";

/**
 * Mailgun inbound route target. Configure the route action as
 * forward("https://<host>/api/inbound/mailgun/mime") — Mailgun then posts the
 * full MIME message in the `body-mime` field.
 */
export async function POST(req: NextRequest) {
  const key = env().MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!key) return NextResponse.json({ error: "Mailgun inbound is not configured" }, { status: 404 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > env().MAX_MESSAGE_SIZE_MB * 1024 * 1024 * 1.5) return NextResponse.json({ error: "Too large" }, { status: 406 });

  const form = await req.formData();
  const timestamp = String(form.get("timestamp") ?? "");
  const token = String(form.get("token") ?? "");
  const signature = String(form.get("signature") ?? "");
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!timestamp || age > 300 || !safeEqual(hmacHex(key, timestamp + token), signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const mime = form.get("body-mime");
  if (typeof mime !== "string" || !mime) {
    // 406 tells Mailgun not to retry.
    return NextResponse.json({ error: "Missing body-mime; use a forward() URL ending in /mime" }, { status: 406 });
  }
  const recipient = String(form.get("recipient") ?? "");
  try {
    const outcome = await ingestRawMessage(Buffer.from(mime, "utf8"), {
      source: "webhook",
      envelope: { rcptTo: recipient ? recipient.split(",").map((r) => r.trim()) : undefined, mailFrom: String(form.get("sender") ?? "") },
    });
    return NextResponse.json({ delivered: outcome.delivered.length });
  } catch (err) {
    if (err instanceof IngestError && err.permanent) return NextResponse.json({ error: err.message }, { status: 406 });
    logger.error({ err }, "mailgun inbound failed");
    return NextResponse.json({ error: "Temporary failure" }, { status: 503 });
  }
}
