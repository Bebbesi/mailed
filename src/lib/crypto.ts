import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(secret: string, input: string | Buffer): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Signs a payload with an expiry: `<base64url(payload)>.<expires>.<signature>`.
 * Used for short-lived download URLs where the cookie is not available.
 */
export function signToken(secret: string, payload: string, ttlSeconds: number): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${Buffer.from(payload).toString("base64url")}.${expires}`;
  return `${body}.${hmacHex(secret, body).slice(0, 48)}`;
}

export function verifySignedToken(secret: string, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [payloadB64, expiresStr, sig] = parts;
  const body = `${payloadB64}.${expiresStr}`;
  if (!safeEqual(hmacHex(secret, body).slice(0, 48), sig)) return null;
  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return null;
  try {
    return Buffer.from(payloadB64, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

function secretKey(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "mailed", "stored-secrets:v1", 32));
}

/**
 * Encrypts a value for storage (AES-256-GCM, key derived from `secret`):
 * `v1.<iv>.<tag>.<ciphertext>`. Changing APP_SECRET makes old values unreadable.
 */
export function encryptSecret(secret: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(secret), iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Returns null for tampered values or ones encrypted with another secret. */
export function decryptSecret(secret: string, value: string): string | null {
  const [version, iv, tag, data] = value.split(".");
  if (version !== "v1" || !iv || !tag || data === undefined) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", secretKey(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
