import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { attachmentDownloadUrl, removeDraftAttachment } from "@/lib/services/attachments";

/** Authorises the download, then redirects to a URL valid for two minutes. */
export const GET = authed<{ id: string }>(async ({ req, params, user }) => {
  const { url } = await attachmentDownloadUrl(user.id, params.id, { allowRisky: req.nextUrl.searchParams.get("confirm") === "1" });
  if (req.nextUrl.searchParams.get("format") === "json") return { url };
  return NextResponse.redirect(new URL(url, req.nextUrl.origin), 302);
});

export const DELETE = authed<{ id: string }>(async ({ params, user }) => {
  await removeDraftAttachment(user.id, params.id);
  return { ok: true };
});
