import addressparser from "nodemailer/lib/addressparser";
import { getDomain } from "tldts";
import { z } from "zod";

export type EmailAddress = { name: string; address: string };

const emailSchema = z.string().email();

export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

export function isValidEmail(address: string): boolean {
  return address.length <= 254 && emailSchema.safeParse(address).success;
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(at + 1).toLowerCase() : "";
}

export function localPartOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at >= 0 ? address.slice(0, at).toLowerCase() : address.toLowerCase();
}

/** eTLD+1 ("mail.example.co.uk" -> "example.co.uk"). */
export function registrableDomain(hostOrAddress: string): string {
  const host = hostOrAddress.includes("@") ? domainOf(hostOrAddress) : hostOrAddress.toLowerCase();
  return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

type ParsedNode = { name?: string; address?: string; group?: ParsedNode[] };

/** Parses an RFC 5322 address list ("A <a@x.com>, b@y.com") into normalized entries. */
export function parseAddressList(input: string | null | undefined): EmailAddress[] {
  if (!input) return [];
  const nodes = addressparser(input) as ParsedNode[];
  const out: EmailAddress[] = [];
  const walk = (list: ParsedNode[]) => {
    for (const node of list) {
      if (node.group) walk(node.group);
      else if (node.address) out.push({ name: (node.name ?? "").trim(), address: normalizeAddress(node.address) });
    }
  };
  walk(nodes);
  return out;
}

export function formatAddress(a: EmailAddress): string {
  if (!a.name) return a.address;
  const needsQuotes = /[",;<>@()[\]:\\]/.test(a.name);
  const name = needsQuotes ? `"${a.name.replace(/["\\]/g, "\\$&")}"` : a.name;
  return `${name} <${a.address}>`;
}

export function displayName(a: { name?: string | null; address: string }): string {
  return a.name?.trim() || a.address;
}

/** Strips angle brackets and whitespace from a Message-ID. */
export function cleanMessageId(id: string | null | undefined): string | null {
  if (!id) return null;
  const v = id.trim().replace(/^<|>$/g, "").trim();
  return v.length > 0 && v.length <= 998 ? v : null;
}

export function parseReferences(value: string | string[] | null | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value.join(" ") : value;
  const ids = raw.match(/<[^<>\s]+>/g) ?? raw.split(/\s+/);
  return ids
    .map((v) => cleanMessageId(v))
    .filter((v): v is string => Boolean(v))
    .slice(-50);
}
