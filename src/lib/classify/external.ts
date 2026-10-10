import { Resolver } from "node:dns/promises";
import { env } from "../env";
import { logger } from "../logger";

export type ExternalVerdict = { provider: string; score: number; action?: string };

/** Optional Rspamd verdict for a raw message. Failures never block delivery. */
export async function rspamdCheck(
  raw: Buffer,
  meta: { ip?: string | null; from?: string | null; rcpt?: string[]; helo?: string | null },
): Promise<ExternalVerdict | null> {
  const url = env().RSPAMD_URL;
  if (!url) return null;
  const headers: Record<string, string> = { "Content-Type": "message/rfc822" };
  if (env().RSPAMD_PASSWORD) headers.Password = env().RSPAMD_PASSWORD!;
  if (meta.ip) headers.IP = meta.ip;
  if (meta.from) headers.From = meta.from;
  if (meta.helo) headers.Helo = meta.helo;
  if (meta.rcpt?.length) headers.Rcpt = meta.rcpt[0];
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/checkv2`, {
      method: "POST",
      headers,
      body: new Uint8Array(raw),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`rspamd responded ${res.status}`);
    const data = (await res.json()) as { score?: number; action?: string };
    return { provider: "Rspamd", score: Number(data.score ?? 0), action: data.action };
  } catch (err) {
    logger.warn({ err }, "rspamd check failed");
    return null;
  }
}

const listedCache = new Map<string, { listed: boolean; at: number }>();

/** Looks up link domains in DNS-based domain blocklists (e.g. Spamhaus DBL). */
export async function dnsblDomainHits(domains: string[]): Promise<string[]> {
  if (!env().DNSBL_ENABLED || domains.length === 0) return [];
  const resolver = new Resolver({ timeout: 2000, tries: 1 });
  const hits: string[] = [];
  const zones = env().DNSBL_DOMAIN_ZONES;
  await Promise.all(
    domains.slice(0, 10).map(async (domain) => {
      const cached = listedCache.get(domain);
      if (cached && Date.now() - cached.at < 3600_000) {
        if (cached.listed) hits.push(domain);
        return;
      }
      let listed = false;
      for (const zone of zones) {
        try {
          const answers = await resolver.resolve4(`${domain}.${zone}`);
          // 127.0.1.x are listings; 127.255.255.x are error codes (e.g. blocked resolver).
          if (answers.some((a) => a.startsWith("127.0.1.") || a === "127.0.0.2")) listed = true;
        } catch {
          /* NXDOMAIN = not listed */
        }
      }
      listedCache.set(domain, { listed, at: Date.now() });
      if (listed) hits.push(domain);
    }),
  );
  return hits;
}
