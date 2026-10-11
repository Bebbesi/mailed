import { NextResponse } from "next/server";
import { authed } from "@/lib/api/handler";
import { notFound } from "@/lib/errors";
import { isOAuthProvider, oauthStartUrl } from "@/lib/linked/oauth";

/** Starts "Sign in with Google/Microsoft": redirects to the provider's consent screen. */
export const GET = authed<{ provider: string }>(async ({ req, params, user }) => {
  if (!isOAuthProvider(params.provider)) throw notFound();
  const hint = req.nextUrl.searchParams.get("email")?.trim().slice(0, 254) || undefined;
  return NextResponse.redirect(oauthStartUrl(user.id, params.provider, hint), 302);
});
