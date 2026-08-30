import { describe, expect, it } from "vitest";
import { clientAddress } from "./client-address";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://internal/test", { headers });
}

describe("clientAddress", () => {
  it("returns 'unknown' when no IP headers are present", () => {
    expect(clientAddress(requestWith({}), 0)).toBe("unknown");
    expect(clientAddress(requestWith({}), 1)).toBe("unknown");
  });

  it("ignores X-Forwarded-For entirely when trustedProxyHops is 0", () => {
    // Critical: with no trusted proxies, XFF is forgeable and must be
    // discarded so an attacker can't bypass the rate limiter by sending a
    // fresh XFF on every attempt.
    const request = requestWith({ "x-forwarded-for": "1.2.3.4" });
    expect(clientAddress(request, 0)).toBe("unknown");
  });

  it("ignores X-Forwarded-For when trustedProxyHops is negative", () => {
    expect(clientAddress(requestWith({ "x-forwarded-for": "1.2.3.4" }), -1)).toBe("unknown");
  });

  it("prefers cf-connecting-ip when present (Cloudflare edge)", () => {
    const request = requestWith({
      "cf-connecting-ip": "203.0.113.10",
      "x-forwarded-for": "1.2.3.4",
    });
    expect(clientAddress(request, 0)).toBe("203.0.113.10");
    expect(clientAddress(request, 2)).toBe("203.0.113.10");
  });

  it("reads the leftmost untrusted-trust-remainder when trustedProxyHops > 0", () => {
    // XFF is "client, hopN-1, hopN-2, …, hop1" - each trusted proxy appends
    // one entry on the right. With trustedProxyHops = N the rightmost N
    // entries are considered trusted (and are discarded from the lookup);
    // the entry N positions from the right is the best estimate of the
    // real client IP. Operators must set the env var to match their actual
    // proxy chain length for this to be accurate.
    const request = requestWith({ "x-forwarded-for": "203.0.113.1, 10.0.0.1, 10.0.0.2" });
    // 1 trusted hop: discard the rightmost 1 entry; next entry is the client.
    expect(clientAddress(request, 1)).toBe("10.0.0.1");
    // 2 trusted hops: discard the rightmost 2; leftmost is the client.
    expect(clientAddress(request, 2)).toBe("203.0.113.1");
  });

  it("falls back to 'unknown' when XFF has fewer entries than trusted hops", () => {
    const request = requestWith({ "x-forwarded-for": "1.2.3.4" });
    expect(clientAddress(request, 3)).toBe("unknown");
  });

  it("trims whitespace around XFF entries", () => {
    const request = requestWith({ "x-forwarded-for": "  1.2.3.4  ,  5.6.7.8  " });
    // 2 entries after trim; trustedProxyHops=1 -> index 0 = "1.2.3.4"
    expect(clientAddress(request, 1)).toBe("1.2.3.4");
    // trustedProxyHops=2 -> not enough entries, fall back to "unknown"
    expect(clientAddress(request, 2)).toBe("unknown");
  });
});