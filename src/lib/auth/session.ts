import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { validateSessionToken, type ValidatedSession } from "./session-core";

export const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-mailed_session" : "mailed_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Validates the session cookie once per request. */
export const getCurrentSession = cache(async (): Promise<ValidatedSession | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSessionToken(token);
});

/** For server components: redirect to the sign-in page when there is no valid session. */
export async function requireSession(): Promise<ValidatedSession> {
  const current = await getCurrentSession();
  if (!current) {
    const h = await headers();
    const path = h.get("x-mailed-path");
    redirect(path && path.startsWith("/app") ? `/login?next=${encodeURIComponent(path)}` : "/login");
  }
  return current;
}
