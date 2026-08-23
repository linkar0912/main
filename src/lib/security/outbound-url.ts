/**
 * Guard for tenant-supplied URLs the *server* will call (lead webhooks).
 *
 * Without this a workspace member can point a webhook at the host's own network —
 * cloud metadata (169.254.169.254), the compose-internal `postgres`/`valkey` hosts,
 * or the app's own API — and make the server issue POSTs there on their behalf.
 *
 * `isSafeOutboundUrl` performs the cheap syntax/literal-address check used while
 * saving definitions. `resolveSafeOutboundTarget` is the mandatory send-time
 * check: it resolves every A/AAAA answer and rejects the destination if any answer
 * can reach a non-public network.
 */

import { lookup as dnsLookup } from "node:dns/promises";

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function isBlockedIpv4(hostname: string): boolean | undefined {
  const parts = hostname.split(".");
  if (parts.length !== 4) return undefined;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return undefined;

  const [a, b] = octets as [number, number, number, number];
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIpv6(hostname: string): boolean | undefined {
  if (!hostname.includes(":")) return undefined;
  const address = hostname.toLowerCase();
  if (address === "::" || address === "::1") return true;
  // IPv4-mapped addresses inherit the IPv4 verdict. `new URL()` rewrites the dotted
  // form to hex (::ffff:169.254.169.254 -> ::ffff:a9fe:a9fe), so both are decoded.
  const mappedDotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(address);
  if (mappedDotted) return isBlockedIpv4(mappedDotted[1]) ?? true;
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(address);
  if (mappedHex) {
    const high = Number.parseInt(mappedHex[1], 16);
    const low = Number.parseInt(mappedHex[2], 16);
    const dotted = `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
    return isBlockedIpv4(dotted) ?? true;
  }
  if (/^f[cd][0-9a-f]{2}:/.test(address)) return true; // unique local fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(address)) return true; // link local fe80::/10
  if (/^ff[0-9a-f]{2}:/.test(address)) return true; // multicast ff00::/8
  return false;
}

export function isBlockedOutboundAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/%.+$/, "").replace(/^\[|\]$/g, "");
  return isBlockedIpv6(normalized) ?? isBlockedIpv4(normalized) ?? true;
}

export function isSafeOutboundUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  if (url.username || url.password) return false; // credentials in URL are never legitimate here

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname) return false;
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;
  if (BLOCKED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return false;

  const ipv6Verdict = isBlockedIpv6(hostname);
  if (ipv6Verdict !== undefined) return !ipv6Verdict;

  const ipv4Verdict = isBlockedIpv4(hostname);
  if (ipv4Verdict !== undefined) return !ipv4Verdict;

  // Single-label hosts are container/service names on the internal network
  // (`postgres`, `valkey`, `web`), never a real webhook endpoint.
  if (!hostname.includes(".")) return false;

  return true;
}

export type OutboundLookup = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

const defaultLookup: OutboundLookup = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

export async function resolveSafeOutboundTarget(
  value: string,
  options: { lookup?: OutboundLookup } = {},
): Promise<URL> {
  if (!isSafeOutboundUrl(value)) {
    throw new Error("Outbound destination is not publicly routable");
  }
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // Literal addresses have already been checked; avoiding DNS here also keeps
  // resolution behavior consistent across Node/platform versions.
  if (isBlockedIpv4(hostname) !== undefined || isBlockedIpv6(hostname) !== undefined) {
    return url;
  }
  let answers: Array<{ address: string; family: number }>;
  try {
    answers = await (options.lookup ?? defaultLookup)(hostname);
  } catch (error) {
    throw new Error(`Outbound destination DNS lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (answers.length === 0 || answers.some(({ address }) => isBlockedOutboundAddress(address))) {
    throw new Error("Outbound destination is not publicly routable");
  }
  return url;
}
