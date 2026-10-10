import type { NextRequest } from "next/server";
import { verifySignedToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { contentDisposition, storage } from "@/lib/storage";
import { logger } from "@/lib/logger";

const SAFE_INLINE = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/i;

/**
 * Serves a stored file for a signed, expiring token issued after an
 * authorisation check. Only images may be shown inline; everything else is a
 * download, with sniffing and active content disabled.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const payload = verifySignedToken(env().APP_SECRET, token);
  if (!payload) return new Response("Link expired", { status: 410 });
  let data: { k: string; f: string; t: string; d: "inline" | "attachment" };
  try {
    data = JSON.parse(payload);
  } catch {
    return new Response("Invalid link", { status: 400 });
  }
  if (!data.k?.startsWith("u/")) return new Response("Invalid link", { status: 400 });
  const inline = data.d === "inline" && SAFE_INLINE.test(data.t);
  try {
    const body = await storage().get(data.k);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": inline ? data.t : "application/octet-stream",
        "Content-Disposition": contentDisposition(inline ? "inline" : "attachment", data.f || "file"),
        "Content-Length": String(body.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, max-age=300",
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  } catch (err) {
    logger.warn({ err }, "signed file not found");
    return new Response("Not found", { status: 404 });
  }
}
