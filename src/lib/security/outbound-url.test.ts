import { describe, expect, it } from "vitest";
import { isSafeOutboundUrl, resolveSafeOutboundTarget } from "./outbound-url";

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
});
