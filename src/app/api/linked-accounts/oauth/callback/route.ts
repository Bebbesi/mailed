import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { exchangeOAuthCode, OAuthError, readOAuthState } from "@/lib/linked/oauth";
import { connectOAuthAccount } from "@/lib/services/linked-accounts";

function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/app/settings", req.nextUrl.origin);
  url.search = new URLSearchParams({ tab: "accounts", ...params }).toString();
  return NextResponse.redirect(url, 302);
}

/**
 * The provider redirects here after consent. The encrypted state must belong
 * to the signed-in user, so a consent obtained in someone else's browser can't
 * attach their mailbox to this account (or vice versa).
 */
export async function GET(req: NextRequest) {
  const current = await getCurrentSession();
  if (!current) return NextResponse.redirect(new URL("/login", req.nextUrl.origin), 302);
  const q = req.nextUrl.searchParams;
  if (q.get("error")) {
    const denied = q.get("error") === "access_denied";
    return back(req, { link_error: denied ? "Access wasn't granted, so the account wasn't linked." : (q.get("error_description") ?? "Sign-in failed.").slice(0, 300) });
  }
  const state = readOAuthState(q.get("state") ?? "");
  const code = q.get("code");
  if (!state || !code || state.u !== current.user.id) {
    return back(req, { link_error: "The sign-in link expired or didn't match your session. Try again." });
  }
  try {
    const result = await exchangeOAuthCode(state.p, code, state.v);
    const account = await connectOAuthAccount(current.user.id, state.p, result);
    return back(req, { linked: account.email });
  } catch (err) {
    const message = err instanceof AppError || err instanceof OAuthError ? err.message : "Couldn't link the account. Try again.";
    if (!(err instanceof AppError)) logger.warn({ err: (err as Error).message, provider: state.p }, "oauth link failed");
    return back(req, { link_error: message.slice(0, 300) });
  }
}
