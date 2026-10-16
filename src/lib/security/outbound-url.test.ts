import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  createPinnedLookup,
  findPublicUrlShortenerLink,
  findPublicUrlShortenerLinks,
  isBlockedOutboundAddress,
  isPublicUrlShortener,
  isSafeOutboundUrl,
  postJsonToSafeOutboundTarget,
  publicUrlShortenerHost,
  publicUrlShortenerMessage,
  resolveSafeOutboundTarget,
} from "./outbound-url";

describe("isSafeOutboundUrl", () => {
  it("allows ordinary public webhook endpoints", () => {
    for (const url of [
      "https://hooks.zapier.com/hooks/catch/123/abc",
      "https://hook.eu2.make.com/abcdef",
      "http://example.com/webhook?token=1",
      "https://n8n.my-domain.io:8443/webhook/lead",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(true);
    }
  });

  it("blocks the host's own network and cloud metadata", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      "http://127.0.0.1:3000/api/automations",
      "http://localhost:3000/api/health",
      "http://0.0.0.0:3000/",
      "http://10.1.2.3/internal",
      "http://172.16.0.9/internal",
      "http://172.31.255.255/internal",
      "http://192.168.1.1/router",
      "http://100.100.0.1/cgnat",
      "http://[::1]:3000/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[::ffff:169.254.169.254]/",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(false);
    }
  });

  it("blocks compose service names and internal suffixes", () => {
    for (const url of [
      "http://postgres:5432/",
      "http://valkey:6379/",
      "http://web:3000/api/broadcasts",
      "http://db.internal/hook",
      "http://printer.local/hook",
      "http://thing.localhost/hook",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(false);
    }
  });

  it("blocks non-http schemes, embedded credentials and junk", () => {
    for (const url of [
      "file:///etc/passwd",
      "gopher://example.com/",
      "ftp://example.com/x",
      "http://user:pass@example.com/hook",
      "not a url",
      "",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(false);
    }
  });

  it("does not mistake public addresses for private ones", () => {
    for (const url of ["http://172.15.0.1/x", "http://172.32.0.1/x", "http://11.0.0.1/x", "http://99.99.99.99/x"]) {
      expect(isSafeOutboundUrl(url), url).toBe(true);
    }
  });
});

describe("resolveSafeOutboundTarget", () => {
  it.each([
    "127.0.0.1",
    "169.254.169.254",
    "10.0.0.8",
    "::1",
    "fc00::1",
    "fe80::1",
  ])("blocks a public-looking hostname resolving to %s", async (address) => {
    await expect(resolveSafeOutboundTarget("https://hooks.example.com/lead", {
      lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
    })).rejects.toThrow(/publicly routable/i);
  });

  it("accepts a hostname only when every resolved address is public", async () => {
    const result = await resolveSafeOutboundTarget("https://hooks.example.com/lead", {
      lookup: async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ],
    });
    expect(result.href).toBe("https://hooks.example.com/lead");
  });

  it.each([
    "64:ff9b::a9fe:a9fe",
    "::7f00:1",
    "::ffff:0:7f00:1",
    "2002:7f00:1::",
    "198.18.0.1",
    "192.0.0.170",
  ])("blocks a hostname resolving to the translated/special address %s", async (address) => {
    await expect(resolveSafeOutboundTarget("https://hooks.example.com/lead", {
      lookup: async () => [{ address, family: address.includes(":") ? 6 : 4 }],
    })).rejects.toThrow(/publicly routable/i);
  });
});

describe("special-purpose and IPv4-embedding ranges", () => {
  it("blocks NAT64, IPv4-compatible, IPv4-translated, 6to4, Teredo and reserved IPv4 literals", () => {
    for (const url of [
      "http://[64:ff9b::169.254.169.254]/",
      "http://[64:ff9b::a9fe:a9fe]/",
      "http://[64:ff9b:1::a00:1]/",
      "http://[::127.0.0.1]/", // URL normalizes this to [::7f00:1]
      "http://[::7f00:1]/",
      "http://[::ffff:0:127.0.0.1]/",
      "http://[::ffff:7f00:1]/",
      "http://[0:0:0:0:0:ffff:a9fe:a9fe]/",
      "http://[2002:a9fe:a9fe::1]/",
      "http://[2001:0:4136:e378::1]/",
      "http://[2001:db8::1]/",
      "http://[fec0::1]/",
      "http://[ff02::1]/",
      "http://198.18.0.1/",
      "http://198.19.255.254/",
      "http://192.0.0.8/",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(false);
    }
  });

  it("still allows ordinary global unicast IPv6 and neighbouring IPv4 ranges", () => {
    for (const url of [
      "http://[2606:2800:220:1:248:1893:25c8:1946]/",
      "http://[2a00:1450:4001:81a::200e]/",
      "http://198.17.0.1/",
      "http://198.20.0.1/",
      "http://192.0.1.1/",
    ]) {
      expect(isSafeOutboundUrl(url), url).toBe(true);
    }
  });

  it("classifies resolver answers in every IPv4-mapped spelling", () => {
    expect(isBlockedOutboundAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedOutboundAddress("::ffff:7f00:1")).toBe(true);
    expect(isBlockedOutboundAddress("0:0:0:0:0:ffff:7f00:1")).toBe(true);
    expect(isBlockedOutboundAddress("::ffff:93.184.216.34")).toBe(false);
  });
});

describe("pinned outbound connections", () => {
  it("connects to the validated address even when the hostname would resolve elsewhere", async () => {
    // A DNS-rebinding attacker answers the validation lookup with a public
    // address and the connect-time lookup with an internal one. The pinned
    // lookup never consults DNS, so the socket goes where validation looked.
    const server = createServer((request, response) => {
      response.end(request.headers.host ?? "");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const request = httpRequest(`http://rebind.invalid:${port}/hook`, {
          lookup: createPinnedLookup({ address: "127.0.0.1", family: 4 }) as never,
        }, (response) => {
          let text = "";
          response.on("data", (chunk) => { text += chunk; });
          response.on("end", () => resolve(text));
        });
        request.on("error", reject);
        request.end();
      });
      // Host header keeps the original hostname (virtual hosting / TLS SNI).
      expect(body).toBe(`rebind.invalid:${port}`);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("refuses to POST to an unsafe destination before opening a socket", async () => {
    await expect(postJsonToSafeOutboundTarget("http://[::7f00:1]/hook", { ok: true })).rejects.toThrow(/publicly routable/i);
    await expect(postJsonToSafeOutboundTarget("https://hooks.example.com/lead", { ok: true }, {
      lookup: async () => [{ address: "64:ff9b::a9fe:a9fe", family: 6 }],
    })).rejects.toThrow(/publicly routable/i);
  });
});

describe("public URL shorteners", () => {
  it.each([
    "bit.ly",
    "tinyurl.com",
    "t.co",
    "goo.gl",
    "ow.ly",
    "is.gd",
    "buff.ly",
    "cutt.ly",
    "rebrand.ly",
    "shorturl.at",
    "rb.gy",
    "tiny.cc",
  ])("recognises %s as a link shortener", (host) => {
    expect(isPublicUrlShortener(`https://${host}/abc123`)).toBe(true);
    expect(publicUrlShortenerHost(`http://${host}/abc123`)).toBe(host);
  });

  it("matches the host however it is written", () => {
    for (const url of [
      "HTTPS://BIT.LY/Abc",
      "https://www.bit.ly/abc",
      "https://bit.ly./abc",
      "https://on.bit.ly/abc",
      "https://bit.ly:443/abc?utm_source=ig",
      "  https://bit.ly/abc  ",
    ]) {
      expect(publicUrlShortenerHost(url), url).toBe("bit.ly");
    }
  });

  it("leaves full links, brand links and look-alike domains alone", () => {
    for (const url of [
      "https://example.com/link",
      "https://shop.example.in/products/kurta?size=m",
      "https://amzn.to/3xYz",
      "https://youtu.be/abc",
      "https://wa.me/919876543210",
      "https://microsoft.co/offer",
      "https://notbit.ly/abc",
      "https://bit.ly.example.com/abc",
      "https://app.linkar.in/api/t/abc",
      "mailto:hello@bit.ly",
      "not a url",
      "",
    ]) {
      expect(isPublicUrlShortener(url), url).toBe(false);
    }
  });

  it("finds a short link written inside message text", () => {
    expect(findPublicUrlShortenerLink("Here’s your guide: https://bit.ly/guide - enjoy!")).toEqual({
      link: "https://bit.ly/guide",
      host: "bit.ly",
    });
    expect(findPublicUrlShortenerLink("Grab it at tinyurl.com/sale-2026 today")).toEqual({
      link: "tinyurl.com/sale-2026",
      host: "tinyurl.com",
    });
    expect(findPublicUrlShortenerLink("Full link https://example.com/a, short one t.co/xyz")?.host).toBe("t.co");
  });

  it("does not flag ordinary text or a full link that only mentions a shortener", () => {
    for (const text of [
      "Thanks for the comment! We’ll get back to you shortly.",
      "The price is.gd friendly, honest.",
      "Visit https://example.com/link for details.",
      "https://example.com/redirect?next=https://bit.ly/abc",
      "https://bit.ly@example.com/abc",
      "Mail us at hello@example.com.",
      "Starts 2026-10-16T09:00:00.000Z",
    ]) {
      expect(findPublicUrlShortenerLink(text), text).toBeUndefined();
    }
  });

  it("reports every short link in a nested value with its path, skipping the keys it is told to", () => {
    const value = {
      actions: [
        { type: "send_text", text: "Hello there" },
        { type: "send_button", text: "Tap below", buttonLabel: "Open", url: "https://cutt.ly/abc" },
      ],
      replies: ["see rb.gy/x"],
      mediaSnapshots: [{ caption: "Link in bio bit.ly/bio" }],
      limit: 5,
      enabled: true,
      missing: null,
    };
    expect(findPublicUrlShortenerLinks(value, { skipKeys: new Set(["mediaSnapshots"]) })).toEqual([
      { path: ["actions", 1, "url"], link: "https://cutt.ly/abc", host: "cutt.ly" },
      { path: ["replies", 0], link: "rb.gy/x", host: "rb.gy" },
    ]);
    expect(findPublicUrlShortenerLinks(value)).toHaveLength(3);
    expect(findPublicUrlShortenerLinks({ url: "https://example.com" })).toEqual([]);
  });

  it("explains the refusal in plain words", () => {
    const message = publicUrlShortenerMessage("bit.ly");
    expect(message).toContain("bit.ly");
    expect(message).toMatch(/full link/i);
    expect(message).not.toMatch(/\u2014|payload|recipient|webhook/i);
  });
});
