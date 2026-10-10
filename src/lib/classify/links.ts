import { domainToUnicode } from "node:url";
import { registrableDomain } from "../mail/address";
import type { ExtractedLink } from "../mail/sanitize";
import { SUSPICIOUS_TLDS, URL_SHORTENERS } from "./signals";

export type LinkFinding = {
  href: string;
  text: string;
  host: string;
  reasons: string[];
  weight: number;
};

export type LinkReport = {
  total: number;
  domains: string[];
  findings: LinkFinding[];
  ipLinks: number;
  shortenerLinks: number;
  mismatchedLinks: number;
  punycodeLinks: number;
};

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

function hostOf(href: string): string | null {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

/** Domain shown in anchor text when the text itself looks like a URL or hostname. */
function displayedHost(text: string): string | null {
  const t = text.trim().toLowerCase();
  const m = /^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[/:?#]|$)/.exec(t);
  return m ? m[1] : null;
}

/**
 * Inspects every link for patterns typical of phishing: raw IP hosts,
 * look-alike internationalised domains, shorteners, credentials-in-URL tricks,
 * and anchor text that shows one domain while pointing at another.
 */
export function analyzeLinks(links: ExtractedLink[]): LinkReport {
  const domains = new Set<string>();
  const findings: LinkFinding[] = [];
  let ipLinks = 0;
  let shortenerLinks = 0;
  let mismatchedLinks = 0;
  let punycodeLinks = 0;
  let total = 0;

  for (const link of links) {
    const href = link.href;
    if (/^(mailto|tel|cid|#)/i.test(href)) continue;
    total++;
    const reasons: string[] = [];
    let weight = 0;

    if (/^\s*(data|javascript|vbscript):/i.test(href)) {
      findings.push({ href: href.slice(0, 200), text: link.text, host: "", reasons: ["Script or data link"], weight: 1.5 });
      continue;
    }
    const host = hostOf(href);
    if (!host) continue;
    const reg = registrableDomain(host);
    domains.add(reg);

    if (IPV4.test(host) || host.includes(":")) {
      ipLinks++;
      reasons.push("Link points to a raw IP address");
      weight += 1.5;
    }
    if (URL_SHORTENERS.has(reg)) {
      shortenerLinks++;
      reasons.push("Shortened link hides the destination");
      weight += 0.4;
    }
    if (host.split(".").some((label) => label.startsWith("xn--"))) {
      punycodeLinks++;
      reasons.push(`Internationalised domain (${domainToUnicode(host)}) may imitate another site`);
      weight += 1.0;
    }
    const tld = host.split(".").pop() ?? "";
    if (SUSPICIOUS_TLDS.has(tld)) {
      reasons.push(`Uncommon top-level domain .${tld}`);
      weight += 0.5;
    }
    try {
      const u = new URL(href);
      if (u.username || /@/.test(u.host)) {
        reasons.push("Link contains credentials that disguise the real host");
        weight += 1.5;
      }
    } catch {
      /* already handled */
    }
    const shown = displayedHost(link.text);
    if (shown && registrableDomain(shown) !== reg) {
      mismatchedLinks++;
      reasons.push(`Text shows ${shown} but the link opens ${host}`);
      weight += 1.8;
    }
    if (reasons.length > 0) {
      findings.push({ href: href.slice(0, 500), text: link.text.slice(0, 200), host, reasons, weight });
    }
  }

  return {
    total,
    domains: [...domains],
    findings: findings.slice(0, 25),
    ipLinks,
    shortenerLinks,
    mismatchedLinks,
    punycodeLinks,
  };
}
