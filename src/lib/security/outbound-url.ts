/**
 * Guard for tenant-supplied URLs the *server* will call (lead webhooks).
 *
 * Without this a workspace member can point a webhook at the host's own network —
 * cloud metadata (169.254.169.254), the compose-internal `postgres`/`valkey` hosts,
 * or the app's own API — and make the server issue POSTs there on their behalf.
 *
 * Scope: this rejects private, loopback, link-local and single-label hosts by
 * inspecting the URL only. It deliberately does not resolve DNS, so a *public*
 * hostname that resolves to a private address is still reachable. Closing that
 * needs resolution at request time plus a connection-level check; the URL-level
 * guard is what removes the trivially exploitable cases.
 */

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
  return false;
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
