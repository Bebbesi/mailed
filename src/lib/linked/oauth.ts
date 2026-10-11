import { createHash, randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "../crypto";
import { env } from "../env";
import { AppError } from "../errors";
import type { LinkedProvider, OAuthProviderId } from "./providers";

type ProviderConfig = {
  clientId?: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
  extra: Record<string, string>;
  linkedProvider: LinkedProvider;
};

function config(id: OAuthProviderId): ProviderConfig {
  const e = env();
  if (id === "google") {
    return {
      clientId: e.GOOGLE_CLIENT_ID,
      clientSecret: e.GOOGLE_CLIENT_SECRET,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scope: "openid email profile https://mail.google.com/",
      extra: { access_type: "offline", prompt: "consent" },
      linkedProvider: "gmail",
    };
  }
  const tenant = encodeURIComponent(e.MICROSOFT_TENANT);
  return {
    clientId: e.MICROSOFT_CLIENT_ID,
    clientSecret: e.MICROSOFT_CLIENT_SECRET,
    authUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    scope: "openid email profile offline_access https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send",
    extra: { prompt: "select_account" },
    linkedProvider: "outlook",
  };
}

export function isOAuthProvider(value: string): value is OAuthProviderId {
  return value === "google" || value === "microsoft";
}

export function oauthConfigured(id: OAuthProviderId): boolean {
  const c = config(id);
  return Boolean(c.clientId && c.clientSecret);
}

export function oauthRedirectUri(): string {
  return new URL("/api/linked-accounts/oauth/callback", env().APP_URL).toString();
}

type OAuthState = { u: string; p: OAuthProviderId; v: string; e: number };

/**
 * Builds the provider's consent URL. The state is encrypted: it binds the flow
 * to the user who started it and carries the PKCE verifier, which must not be
 * readable by anyone who sees the redirect.
 */
export function oauthStartUrl(userId: string, id: OAuthProviderId, loginHint?: string): string {
  const c = config(id);
  if (!c.clientId || !c.clientSecret) throw new AppError(503, "oauth_not_configured", "Sign-in with this provider isn't set up on this server.");
  const verifier = randomBytes(48).toString("base64url");
  const state: OAuthState = { u: userId, p: id, v: verifier, e: Date.now() + 10 * 60_000 };
  const url = new URL(c.authUrl);
  url.search = new URLSearchParams({
    client_id: c.clientId,
    redirect_uri: oauthRedirectUri(),
    response_type: "code",
    scope: c.scope,
    state: encryptSecret(env().APP_SECRET, JSON.stringify(state)),
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...c.extra,
    ...(loginHint ? { login_hint: loginHint } : {}),
  }).toString();
  return url.toString();
}

export function readOAuthState(value: string): OAuthState | null {
  const plain = decryptSecret(env().APP_SECRET, value);
  if (!plain) return null;
  try {
    const s = JSON.parse(plain) as OAuthState;
    if (!s.u || !isOAuthProvider(s.p) || !s.v || typeof s.e !== "number" || s.e < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(id: OAuthProviderId, params: Record<string, string>): Promise<TokenResponse> {
  const c = config(id);
  if (!c.clientId || !c.clientSecret) throw new AppError(503, "oauth_not_configured", "Sign-in with this provider isn't set up on this server.");
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    const err = new OAuthError(body.error_description || body.error || `Token request failed (${res.status})`, body.error === "invalid_grant");
    throw err;
  }
  return body;
}

export class OAuthError extends Error {
  constructor(
    message: string,
    /** The refresh token was revoked or expired: the user has to sign in again. */
    public readonly revoked = false,
  ) {
    super(message);
    this.name = "OAuthError";
  }
}

/**
 * The ID token comes straight from the provider's token endpoint over TLS,
 * so its claims can be read without verifying the signature (OIDC Core 3.1.3.7).
 */
function idTokenClaims(idToken?: string): { email?: string; name?: string; preferred_username?: string } {
  const payload = idToken?.split(".")[1];
  if (!payload) return {};
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

export async function exchangeOAuthCode(id: OAuthProviderId, code: string, verifier: string) {
  const t = await tokenRequest(id, { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: oauthRedirectUri() });
  if (!t.refresh_token) throw new OAuthError("The provider did not grant offline access. Try again and accept all permissions.");
  const claims = idTokenClaims(t.id_token);
  const email = (claims.email ?? claims.preferred_username ?? "").trim().toLowerCase();
  if (!email.includes("@")) throw new OAuthError("The provider did not share the account's email address.");
  return {
    provider: config(id).linkedProvider,
    email,
    name: claims.name?.trim() || null,
    refreshToken: t.refresh_token,
    accessToken: t.access_token!,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
  };
}

export async function refreshOAuthToken(id: OAuthProviderId, refreshToken: string) {
  const t = await tokenRequest(id, { grant_type: "refresh_token", refresh_token: refreshToken });
  return {
    accessToken: t.access_token!,
    expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000,
    // Microsoft rotates refresh tokens; Google usually keeps the old one.
    refreshToken: t.refresh_token ?? null,
  };
}
