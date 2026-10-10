import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  createPinnedLookup,
  isBlockedOutboundAddress,
  isSafeOutboundUrl,
  postJsonToSafeOutboundTarget,
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
