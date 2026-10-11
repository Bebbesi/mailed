import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { isPublicIp } from "@/lib/linked/net";
import { oauthStartUrl, readOAuthState } from "@/lib/linked/oauth";
import { providerForAddress } from "@/lib/linked/providers";
import { resetEnvCache } from "@/lib/env";

const SECRET = "secret-secret-secret-secret-secret!!";

describe("stored secrets", () => {
  it("round-trips and rejects tampering or another key", () => {
    const enc = encryptSecret(SECRET, "app password 123");
    expect(enc).not.toContain("app password");
    expect(decryptSecret(SECRET, enc)).toBe("app password 123");
    expect(encryptSecret(SECRET, "x")).not.toBe(encryptSecret(SECRET, "x"));
    expect(decryptSecret("another-secret-another-secret-12345", enc)).toBeNull();
    const parts = enc.split(".");
    parts[3] = Buffer.from("forged").toString("base64url");
    expect(decryptSecret(SECRET, parts.join("."))).toBeNull();
    expect(decryptSecret(SECRET, "garbage")).toBeNull();
  });
});

describe("mail server addresses", () => {
  it("only allows public IPs", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.5", "192.168.1.10", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
    for (const ip of ["142.250.27.108", "52.97.0.1", "2a00:1450:4001:81b::2005"]) expect(isPublicIp(ip), ip).toBe(true);
    expect(isPublicIp("not-an-ip")).toBe(false);
  });

  it("guesses the provider from the address", () => {
    expect(providerForAddress("Me@Gmail.com")).toBe("gmail");
    expect(providerForAddress("me@hotmail.it")).toBe("outlook");
    expect(providerForAddress("me@icloud.com")).toBe("icloud");
    expect(providerForAddress("me@libero.it")).toBe("other");
  });
});

describe("oauth state", () => {
  it("is encrypted, carries the PKCE verifier and expires", () => {
    process.env.GOOGLE_CLIENT_ID = "client";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    resetEnvCache();
    try {
      const url = new URL(oauthStartUrl("user-1", "google", "me@gmail.com"));
      expect(url.origin).toBe("https://accounts.google.com");
      expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/linked-accounts/oauth/callback");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("login_hint")).toBe("me@gmail.com");
      const state = url.searchParams.get("state")!;
      const parsed = readOAuthState(state);
      expect(parsed?.u).toBe("user-1");
      expect(parsed?.p).toBe("google");
      expect(state).not.toContain(parsed!.v);
      expect(readOAuthState(`${state}x`)).toBeNull();
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 11 * 60_000);
      expect(readOAuthState(state)).toBeNull();
    } finally {
      vi.useRealTimers();
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      resetEnvCache();
    }
  });
});
