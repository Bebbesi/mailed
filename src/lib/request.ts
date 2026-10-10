import { env } from "./env";

type HeaderSource = { get(name: string): string | null };

/**
 * Client IP. Next.js appends the socket address to X-Forwarded-For, so without
 * a trusted reverse proxy the last entry is the direct peer; with one, the
 * first entry is the client as reported by the proxy.
 */
export function clientIp(headers: HeaderSource): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      const ip = env().TRUST_PROXY ? parts[0] : parts[parts.length - 1];
      return ip.replace(/^::ffff:/, "");
    }
  }
  return headers.get("x-real-ip") ?? "unknown";
}

export function userAgent(headers: HeaderSource): string {
  return (headers.get("user-agent") ?? "").slice(0, 400);
}
