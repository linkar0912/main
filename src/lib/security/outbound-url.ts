/**
 * Guard for tenant-supplied URLs the *server* will call (lead webhooks,
 * tracked-link conversion callbacks).
 *
 * Without this a workspace member can point a webhook at the host's own network -
 * cloud metadata (169.254.169.254), the compose-internal `postgres`/`valkey` hosts,
 * or the app's own API - and make the server issue POSTs there on their behalf.
 *
 * `isSafeOutboundUrl` performs the cheap syntax/literal-address check used while
 * saving definitions. `resolveSafeOutboundTarget` is the mandatory send-time
 * check: it resolves every A/AAAA answer and rejects the destination if any answer
 * can reach a non-public network. `postJsonToSafeOutboundTarget` additionally
 * pins the connection to the validated address and never follows redirects.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function isBlockedIpv4(hostname: string): boolean | undefined {
  const parts = hostname.split(".");
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  if (octets.some((octet) => !Number.isInteger(octet))) return undefined;
  // Every label is numeric, so this is an IPv4 literal - possibly an
  // abbreviated one resolvers re-expand ("127.1" style padding). Only a
  // well-formed quad can be classified against the blocklist; reject the
  // rest rather than let them through as DNS hostnames.
  if (parts.length !== 4 || octets.some((octet) => octet > 255)) return true;

  const [a, b, c] = octets as [number, number, number, number];
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, includes cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * Expands an IPv6 literal (optionally ending in a dotted quad) into its eight
 * 16-bit groups, or returns null when the text is not a valid IPv6 literal.
 */
function parseIpv6(address: string): number[] | null {
  let text = address;
  const tail: number[] = [];
  const dotted = /^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (dotted) {
    const octets = dotted[2]!.split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return null;
    tail.push((octets[0]! << 8) | octets[1]!, (octets[2]! << 8) | octets[3]!);
    text = dotted[1]!.endsWith("::") ? dotted[1]! : dotted[1]!.slice(0, -1);
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (value: string) => (value ? value.split(":") : []).map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN);
  const head = parseGroups(halves[0] ?? "");
  const rest = halves.length === 2 ? parseGroups(halves[1] ?? "") : [];
  if ([...head, ...rest].some((group) => Number.isNaN(group))) return null;
  const explicit = head.length + rest.length + tail.length;
  if (halves.length === 1) return explicit === 8 ? [...head, ...tail] : null;
  if (explicit > 7) return null;
  return [...head, ...new Array<number>(8 - explicit).fill(0), ...rest, ...tail];
}

function embeddedIpv4(high: number, low: number): string {
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

function isBlockedIpv6(hostname: string): boolean | undefined {
  if (!hostname.includes(":")) return undefined;
  const groups = parseIpv6(hostname.toLowerCase());
  // Contains a colon but is not a valid IPv6 literal: never a usable host.
  if (!groups) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups as [number, number, number, number, number, number, number, number];
  const leadingZero = (count: number) => groups.slice(0, count).every((group) => group === 0);

  if (leadingZero(8)) return true; // unspecified ::
  if (leadingZero(7) && g7 === 1) return true; // loopback ::1
  // IPv4-mapped ::ffff:a.b.c.d inherits the IPv4 verdict. `new URL()` rewrites
  // the dotted form to hex (::ffff:a9fe:a9fe); both parse to the same groups.
  if (leadingZero(5) && g5 === 0xffff) return isBlockedIpv4(embeddedIpv4(g6, g7)) ?? true;
  // IPv4-compatible ::a.b.c.d (deprecated; URL normalizes ::127.0.0.1 to
  // ::7f00:1) and IPv4-translated ::ffff:0:a.b.c.d. Neither is a legitimate
  // public webhook address and both can reach the embedded IPv4 host.
  if (leadingZero(6)) return true;
  if (leadingZero(4) && g4 === 0xffff && g5 === 0) return true;
  // NAT64 well-known prefix 64:ff9b::/96 and local-use 64:ff9b:1::/48 reach an
  // embedded IPv4 address through the network's NAT64 gateway.
  if (g0 === 0x64 && g1 === 0xff9b) return true;
  if (g0 === 0x2002) return true; // 6to4 2002::/16 embeds an IPv4 address
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo 2001::/32
  if (g0 === 0x2001 && g1 === 0xdb8) return true; // documentation 2001:db8::/32
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard 100::/64
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // deprecated site local fec0::/10
  if ((g0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
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

type ResolvedAddress = { address: string; family: number };

const defaultLookup: OutboundLookup = async (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

async function resolveSafeOutboundAddresses(
  value: string,
  options: { lookup?: OutboundLookup },
): Promise<{ url: URL; addresses: ResolvedAddress[] }> {
  if (!isSafeOutboundUrl(value)) {
    throw new Error("Outbound destination is not publicly routable");
  }
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  // Literal addresses have already been checked; avoiding DNS here also keeps
  // resolution behavior consistent across Node/platform versions.
  if (isBlockedIpv6(hostname) !== undefined) return { url, addresses: [{ address: hostname, family: 6 }] };
  if (isBlockedIpv4(hostname) !== undefined) return { url, addresses: [{ address: hostname, family: 4 }] };
  let answers: ResolvedAddress[];
  try {
    answers = await (options.lookup ?? defaultLookup)(hostname);
  } catch (error) {
    throw new Error(`Outbound destination DNS lookup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (answers.length === 0 || answers.some(({ address }) => isBlockedOutboundAddress(address))) {
    throw new Error("Outbound destination is not publicly routable");
  }
  return { url, addresses: answers };
}

export async function resolveSafeOutboundTarget(
  value: string,
  options: { lookup?: OutboundLookup } = {},
): Promise<URL> {
  return (await resolveSafeOutboundAddresses(value, options)).url;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number,
) => void;

/**
 * A `lookup` for node:http(s) that ignores DNS and always answers with an
 * address that was already validated. Re-resolving at connect time is exactly
 * what a DNS-rebinding attacker relies on: the check sees a public answer, the
 * connection gets 169.254.169.254.
 */
export function createPinnedLookup(pinned: ResolvedAddress) {
  return (_hostname: string, options: unknown, callback?: LookupCallback) => {
    const done = (typeof options === "function" ? options : callback) as LookupCallback;
    const all = typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;
    if (all) done(null, [{ address: pinned.address, family: pinned.family }]);
    else done(null, pinned.address, pinned.family);
  };
}

/**
 * POSTs a JSON body to a tenant-supplied URL with the SSRF guard applied end
 * to end: the URL is validated, every DNS answer is checked, the socket is
 * pinned to a validated address (TLS SNI and the Host header still carry the
 * original hostname), and redirects are never followed - a 3xx is returned
 * as the result status, mirroring lead-delivery's `redirect: "manual"`.
 */
export async function postJsonToSafeOutboundTarget(
  value: string,
  body: unknown,
  options: { lookup?: OutboundLookup; timeoutMs?: number } = {},
): Promise<{ status: number }> {
  const { url, addresses } = await resolveSafeOutboundAddresses(value, options);
  const pinned = addresses[0]!;
  const payload = JSON.stringify(body);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
      lookup: createPinnedLookup(pinned) as never,
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    }, (response) => {
      // The body is irrelevant; drain it so the socket is released.
      response.resume();
      resolve({ status: response.statusCode ?? 0 });
    });
    request.on("error", reject);
    request.end(payload);
  });
}
