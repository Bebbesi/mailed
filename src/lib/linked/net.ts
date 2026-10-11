import { lookup } from "node:dns/promises";
import net from "node:net";
import { env } from "../env";
import { badRequest } from "../errors";

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

// Loopback, private, link-local, CGNAT, benchmarking, multicast and reserved ranges.
const blocked = new net.BlockList();
for (const [addr, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv4");
}
for (const [addr, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(addr, prefix, "ipv6");
}

export function isPublicIp(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return !blocked.check(mapped[1], "ipv4");
  const family = net.isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

/**
 * Resolves a user-supplied mail server and returns the address to connect to.
 * Connecting to the checked IP (with the hostname kept for TLS verification)
 * stops a DNS answer that changes between check and use from reaching
 * internal services.
 */
export async function resolveMailHost(host: string): Promise<string> {
  const name = host.trim().toLowerCase();
  if (!HOSTNAME.test(name) && net.isIP(name) === 0) throw badRequest(`“${host}” is not a valid server name.`);
  let addresses: { address: string }[];
  try {
    addresses = net.isIP(name) ? [{ address: name }] : await lookup(name, { all: true, verbatim: true });
  } catch {
    throw badRequest(`Couldn't find the server “${host}”. Check the name.`);
  }
  if (addresses.length === 0) throw badRequest(`Couldn't find the server “${host}”. Check the name.`);
  if (env().LINKED_ALLOW_PRIVATE_HOSTS) return addresses[0].address;
  const usable = addresses.find((a) => isPublicIp(a.address));
  if (!usable || addresses.some((a) => !isPublicIp(a.address))) {
    throw badRequest(`“${host}” points to a private network address, which isn't allowed.`);
  }
  return usable.address;
}
