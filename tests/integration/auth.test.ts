import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { GET as getMe, DELETE as deleteMe } from "@/app/api/me/route";
import { POST as changePassword } from "@/app/api/me/password/route";
import { GET as listSessions, DELETE as revokeOthers } from "@/app/api/sessions/route";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { issueAuthToken } from "@/lib/auth/tokens";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { authTokens, messages, sessions, users } from "@/lib/db/schema";
import { verifyEmailToken } from "@/lib/services/auth";
import { cookieJar } from "../helpers/cookies";
import { createUser, ctx, json, request, signIn, signOut } from "../helpers/factory";

const valid = {
  firstName: "Alice",
  lastName: "Rossi",
  username: "alice",
  recoveryEmail: "alice@example.org",
  password: "correct-horse-battery-staple",
};

describe("registration", () => {
  it("creates the account, hashes the password and starts a session", async () => {
    const res = await register(request("POST", "/api/auth/register", valid), ctx());
    expect(res.status).toBe(200);
    const body = await json<{ address: string }>(res);
    expect(body.address).toBe("alice@mailed.test");
    const [u] = await db.select().from(users).where(eq(users.address, "alice@mailed.test"));
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
    expect(u.passwordHash).not.toContain(valid.password);
    expect(u.emailVerifiedAt).toBeNull();
    expect(cookieJar.get(SESSION_COOKIE)?.value).toBeTruthy();
    const [token] = await db.select().from(authTokens).where(eq(authTokens.userId, u.id));
    expect(token.type).toBe("verify_email");
  });

  it("rejects taken, reserved and invalid input", async () => {
    await register(request("POST", "/api/auth/register", valid), ctx());
    signOut();
    const dup = await register(request("POST", "/api/auth/register", { ...valid, recoveryEmail: "other@example.org" }), ctx());
    expect(dup.status).toBe(409);
    const reserved = await register(request("POST", "/api/auth/register", { ...valid, username: "postmaster", recoveryEmail: "x@example.org" }), ctx());
    expect(reserved.status).toBe(400);
    const weak = await register(request("POST", "/api/auth/register", { ...valid, username: "bob", recoveryEmail: "b@example.org", password: "short" }), ctx());
    expect(weak.status).toBe(400);
    const localRecovery = await register(request("POST", "/api/auth/register", { ...valid, username: "carol", recoveryEmail: "carol@mailed.test" }), ctx());
    expect(localRecovery.status).toBe(400);
  });

  it("blocks cross-site requests", async () => {
    const res = await register(request("POST", "/api/auth/register", valid, { origin: "https://evil.example" }), ctx());
    expect(res.status).toBe(403);
    const [u] = await db.select().from(users).where(eq(users.address, "alice@mailed.test"));
    expect(u).toBeUndefined();
  });
});

describe("sign in and sessions", () => {
  it("signs in with address, username or recovery email and rejects wrong passwords", async () => {
    const user = await createUser({ username: "dana" });
    for (const identifier of ["dana@mailed.test", "dana", "dana.recovery@example.org", "DANA@MAILED.TEST"]) {
      signOut();
      const ok = await login(request("POST", "/api/auth/login", { identifier, password: user.password }), ctx());
      expect(ok.status).toBe(200);
      expect(cookieJar.get(SESSION_COOKIE)).toBeTruthy();
    }
    signOut();
    const bad = await login(request("POST", "/api/auth/login", { identifier: "dana", password: "wrong-password-123" }), ctx());
    expect(bad.status).toBe(401);
    expect((await json<{ error: { message: string } }>(bad)).error.message).toBe("The email or password is incorrect.");
    const unknown = await login(request("POST", "/api/auth/login", { identifier: "nobody", password: "wrong-password-123" }), ctx());
    expect(unknown.status).toBe(401);
  });

  it("rate limits repeated failed attempts for an account", async () => {
    await createUser({ username: "erin" });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await login(request("POST", "/api/auth/login", { identifier: "erin", password: `wrong-${i}-password` }), ctx());
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("protects private endpoints and ends sessions on logout", async () => {
    expect((await getMe(request("GET", "/api/me"), ctx())).status).toBe(401);
    const user = await createUser();
    await signIn(user.id);
    const me = await getMe(request("GET", "/api/me"), ctx());
    expect(me.status).toBe(200);
    expect((await json<{ address: string }>(me)).address).toBe(user.address);
    await logout(request("POST", "/api/auth/logout", {}), ctx());
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    expect((await getMe(request("GET", "/api/me"), ctx())).status).toBe(401);
  });

  it("rejects tampered or expired session tokens", async () => {
    const user = await createUser();
    const token = await signIn(user.id);
    cookieJar.set(SESSION_COOKIE, `${token}x`);
    expect((await getMe(request("GET", "/api/me"), ctx())).status).toBe(401);
    cookieJar.set(SESSION_COOKIE, token);
    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, user.id));
    expect((await getMe(request("GET", "/api/me"), ctx())).status).toBe(401);
  });

  it("lists sessions and signs out other devices", async () => {
    const user = await createUser();
    await signIn(user.id);
    const other = cookieJar.get(SESSION_COOKIE)!.value;
    await signIn(user.id);
    const list = await json<{ sessions: { current: boolean }[] }>(await listSessions(request("GET", "/api/sessions"), ctx()));
    expect(list.sessions).toHaveLength(2);
    expect(list.sessions.filter((s) => s.current)).toHaveLength(1);
    await revokeOthers(request("DELETE", "/api/sessions"), ctx());
    cookieJar.set(SESSION_COOKIE, other);
    expect((await getMe(request("GET", "/api/me"), ctx())).status).toBe(401);
  });
});

describe("email verification and password reset", () => {
  it("verifies the recovery email with a single-use token", async () => {
    const user = await createUser({ verified: false });
    const token = await issueAuthToken(user.id, "verify_email", user.recoveryEmail);
    expect(await verifyEmailToken(token)).toBeTruthy();
    expect(await verifyEmailToken(token)).toBeNull();
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(u.emailVerifiedAt).not.toBeNull();
  });

  it("does not verify an address that changed after the link was sent", async () => {
    const user = await createUser({ verified: false });
    const token = await issueAuthToken(user.id, "verify_email", user.recoveryEmail);
    await db.update(users).set({ recoveryEmail: "changed@example.org" }).where(eq(users.id, user.id));
    expect(await verifyEmailToken(token)).toBeNull();
  });

  it("answers forgot-password identically for unknown accounts", async () => {
    const a = await forgot(request("POST", "/api/auth/forgot-password", { identifier: "ghost@mailed.test" }), ctx());
    expect(a.status).toBe(200);
    const user = await createUser();
    const b = await forgot(request("POST", "/api/auth/forgot-password", { identifier: user.address }), ctx());
    expect(await a.json()).toEqual(await b.json());
    const tokens = await db.select().from(authTokens).where(eq(authTokens.userId, user.id));
    expect(tokens.some((t) => t.type === "reset_password")).toBe(true);
  });

  it("resets the password once and signs out every session", async () => {
    const user = await createUser();
    await signIn(user.id);
    const token = await issueAuthToken(user.id, "reset_password", user.recoveryEmail);
    signOut();
    const res = await reset(request("POST", "/api/auth/reset-password", { token, password: "a-brand-new-passphrase" }), ctx());
    expect(res.status).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.userId, user.id))).toHaveLength(0);
    const again = await reset(request("POST", "/api/auth/reset-password", { token, password: "another-new-passphrase" }), ctx());
    expect(again.status).toBe(400);
    const ok = await login(request("POST", "/api/auth/login", { identifier: user.address, password: "a-brand-new-passphrase" }), ctx());
    expect(ok.status).toBe(200);
  });

  it("changes the password only with the current one and keeps the current session", async () => {
    const user = await createUser();
    await signIn(user.id);
    const wrong = await changePassword(request("POST", "/api/me/password", { currentPassword: "nope-nope-nope", newPassword: "fresh-passphrase-2026" }), ctx());
    expect(wrong.status).toBe(400);
    const ok = await changePassword(request("POST", "/api/me/password", { currentPassword: user.password, newPassword: "fresh-passphrase-2026" }), ctx());
    expect(ok.status).toBe(200);
    expect((await getMe(request("GET", "/api/me"), ctx())).status).toBe(200);
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(await verifyPassword(u.passwordHash, "fresh-passphrase-2026")).toBe(true);
  });
});

describe("account deletion", () => {
  it("requires the password and the confirmation word, then removes all data", async () => {
    const user = await createUser();
    await signIn(user.id);
    const noConfirm = await deleteMe(request("DELETE", "/api/me", { password: user.password, confirm: "yes" }), ctx());
    expect(noConfirm.status).toBe(400);
    const badPassword = await deleteMe(request("DELETE", "/api/me", { password: "wrong-password", confirm: "DELETE" }), ctx());
    expect(badPassword.status).toBe(400);
    const ok = await deleteMe(request("DELETE", "/api/me", { password: user.password, confirm: "DELETE" }), ctx());
    expect(ok.status).toBe(200);
    expect(await db.select().from(users).where(eq(users.id, user.id))).toHaveLength(0);
    expect(await db.select().from(messages).where(eq(messages.userId, user.id))).toHaveLength(0);
  });
});
