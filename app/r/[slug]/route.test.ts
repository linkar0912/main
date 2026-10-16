import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { logger } from "@/src/lib/logger";

let repository = createMemoryRepository();

const mocks = vi.hoisted(() => ({ postJson: vi.fn() }));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));
vi.mock("@/src/lib/security/outbound-url", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/security/outbound-url")>()),
  postJsonToSafeOutboundTarget: mocks.postJson,
}));

const { GET } = await import("./route");

const context = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("GET /r/[slug]", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.postJson.mockReset().mockResolvedValue({ status: 200 });
  });

  it("redirects to the destination with UTM params appended", async () => {
    await repository.createTrackedLink("workspace_1", {
      slug: "launch",
      destination: "https://example.com/pricing?ref=x",
      utmSource: "instagram",
      utmCampaign: "launch",
    });

    const response = await GET(new Request("http://localhost/r/launch"), context("launch"));

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://example.com/pricing");
    expect(location.searchParams.get("ref")).toBe("x");
    expect(location.searchParams.get("utm_source")).toBe("instagram");
    expect(location.searchParams.get("utm_campaign")).toBe("launch");
  });

  // The redirect path re-validates rather than trusting the stored destination:
  // rows can predate the create-time isSafeOutboundUrl check, or arrive via a
  // seed / import / direct DB edit.
  it.each([
    ["a javascript: scheme", "javascript:alert(1)"],
    ["a data: scheme", "data:text/html,<script>alert(1)</script>"],
    ["a link-local (cloud metadata) address", "http://169.254.169.254/latest/meta-data/"],
    ["an RFC1918 address", "http://10.0.0.5/internal"],
    ["a compose-internal single-label host", "http://postgres:5432/"],
    ["an unparseable value", "not a url"],
  ])("404s instead of redirecting when the destination is %s", async (_label, destination) => {
    await repository.createTrackedLink("workspace_1", { slug: "bad", destination });

    const response = await GET(new Request("http://localhost/r/bad"), context("bad"));

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
  });

  it("does not count a click or fire the conversion callback for a link it refuses to forward", async () => {
    await repository.createTrackedLink("workspace_1", {
      slug: "bad",
      destination: "javascript:alert(1)",
      conversionUrl: "https://hooks.example.com/conversion",
    });
    const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET(new Request("http://localhost/r/bad"), context("bad"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(404);
    expect(recordClick).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("counts a click for a link that forwards", async () => {
    await repository.createTrackedLink("workspace_1", { slug: "good", destination: "https://example.com/" });
    const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");

    const response = await GET(new Request("http://localhost/r/good"), context("good"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(302);
    expect(recordClick).toHaveBeenCalledTimes(1);
  });

  it("stops counting clicks from one visitor past the per-minute cap but still redirects", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    try {
      await repository.createTrackedLink("workspace_1", {
        slug: "flood",
        destination: "https://example.com/",
        conversionUrl: "https://hooks.example.com/conversion",
      });
      const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");
      const click = () => GET(new Request("http://localhost/r/flood", { headers: { "cf-connecting-ip": "198.51.100.50" } }), context("flood"));

      for (let i = 0; i < 31; i++) expect((await click()).status).toBe(302);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(recordClick).toHaveBeenCalledTimes(30);
      expect(mocks.postJson).toHaveBeenCalledTimes(30);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // With no trusted proxy every visitor resolves to "anon", so one shared cap
  // would drop real clicks on any busy link.
  it("counts every click without the cap when no trusted proxy is configured", async () => {
    await repository.createTrackedLink("workspace_1", {
      slug: "anon-open",
      destination: "https://example.com/",
      conversionUrl: "https://hooks.example.com/conversion",
    });
    const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");
    // No trusted proxy, so each X-Forwarded-For (forgeable) still resolves to "anon".
    const click = (i: number) => GET(
      new Request("http://localhost/r/anon-open", { headers: { "x-forwarded-for": `198.51.100.${i}` } }),
      context("anon-open"),
    );

    for (let i = 0; i < 31; i++) expect((await click(i)).status).toBe(302);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(recordClick).toHaveBeenCalledTimes(31);
    expect(recordClick.mock.calls.every(([, input]) => input.ipHash === "anon")).toBe(true);
    expect(mocks.postJson).toHaveBeenCalledTimes(31);
  });

  // Behind a trusted proxy, a request with no client address is a direct hit
  // on the origin or an internal one, and hashes to "anon".
  it("caps clicks without a known address at 30 a minute per link behind a trusted proxy, still redirecting", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    try {
      await repository.createTrackedLink("workspace_1", {
        slug: "anon-flood",
        destination: "https://example.com/",
        conversionUrl: "https://hooks.example.com/conversion",
      });
      const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");
      const click = () => GET(new Request("http://localhost/r/anon-flood"), context("anon-flood"));

      for (let i = 0; i < 31; i++) expect((await click()).status).toBe(302);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(recordClick).toHaveBeenCalledTimes(30);
      expect(recordClick.mock.calls.every(([, input]) => input.ipHash === "anon")).toBe(true);
      expect(mocks.postJson).toHaveBeenCalledTimes(30);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("counts every click from distinct visitors behind a trusted proxy", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    try {
      await repository.createTrackedLink("workspace_1", { slug: "busy", destination: "https://example.com/" });
      const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");
      const click = (i: number) => GET(
        new Request("http://localhost/r/busy", { headers: { "cf-connecting-ip": `198.51.100.${i}` } }),
        context("busy"),
      );

      for (let i = 0; i < 40; i++) expect((await click(i)).status).toBe(302);
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(recordClick).toHaveBeenCalledTimes(40);
      expect(new Set(recordClick.mock.calls.map(([, input]) => input.ipHash)).size).toBe(40);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps a visitor with a known address out of the exhausted anonymous bucket", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    try {
      await repository.createTrackedLink("workspace_1", { slug: "mixed", destination: "https://example.com/" });
      const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");

      // No CF-Connecting-IP and no X-Forwarded-For: "anon" even behind a trusted proxy.
      for (let i = 0; i < 31; i++) await GET(new Request("http://localhost/r/mixed"), context("mixed"));
      await GET(new Request("http://localhost/r/mixed", { headers: { "cf-connecting-ip": "198.51.100.77" } }), context("mixed"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(recordClick).toHaveBeenCalledTimes(31);
      expect(recordClick.mock.calls.slice(0, 30).every(([, input]) => input.ipHash === "anon")).toBe(true);
      expect(recordClick.mock.calls.at(-1)?.[1].ipHash).toMatch(/^[0-9a-f]{16}$/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps each link's anonymous bucket separate", async () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "1");
    try {
      await repository.createTrackedLink("workspace_1", { slug: "first", destination: "https://example.com/" });
      await repository.createTrackedLink("workspace_1", { slug: "second", destination: "https://example.com/" });
      const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");

      for (let i = 0; i < 31; i++) await GET(new Request("http://localhost/r/first"), context("first"));
      await GET(new Request("http://localhost/r/second"), context("second"));
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(recordClick).toHaveBeenCalledTimes(31);
      const second = await repository.getTrackedLinkBySlugPublic("second");
      expect(recordClick.mock.calls.at(-1)?.[0]).toBe(second?.id);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("warns once per process in production when no trusted proxy is configured", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "development");
    try {
      await repository.createTrackedLink("workspace_1", { slug: "warned", destination: "https://example.com/" });
      await GET(new Request("http://localhost/r/warned"), context("warned"));
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("TRUSTED_PROXY_HOPS"));

      vi.stubEnv("NODE_ENV", "production");
      // Production config checks need these; neither changes what the route does here.
      vi.stubEnv("DEMO_MODE", "1");
      vi.stubEnv("AUTH_SESSION_SECRET", "route-test-session-secret-0123456789abcdef");
      vi.stubEnv("PLATFORM_OWNER_USER_IDS", "00000000-0000-4000-8000-000000000001");
      for (let i = 0; i < 3; i++) await GET(new Request("http://localhost/r/warned"), context("warned"));
      const proxyWarnings = warn.mock.calls.filter(([message]) => String(message).includes("TRUSTED_PROXY_HOPS is 0"));
      expect(proxyWarnings).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
      warn.mockRestore();
    }
  });

  it("410s an expired link before touching the destination", async () => {
    await repository.createTrackedLink("workspace_1", {
      slug: "old",
      destination: "https://example.com/",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const response = await GET(new Request("http://localhost/r/old"), context("old"));

    expect(response.status).toBe(410);
  });

  it("404s a link the owner console disabled", async () => {
    await repository.createTrackedLink("workspace_1", {
      slug: "off",
      destination: "https://example.com/",
      disabledAt: "2026-10-01T00:00:00.000Z",
    });

    const response = await GET(new Request("http://localhost/r/off"), context("off"));

    expect(response.status).toBe(404);
  });

  it("404s a link whose workspace is not ACTIVE", async () => {
    await repository.ensureWorkspace("workspace_1", "owner@example.com", "user_1");
    await repository.createTrackedLink("workspace_1", { slug: "paused", destination: "https://example.com/" });
    await repository.setWorkspaceLifecycle("workspace_1", {
      status: "SUSPENDED",
      reason: "abuse",
      actorUserId: "admin_1",
      at: new Date().toISOString(),
    });

    const response = await GET(new Request("http://localhost/r/paused"), context("paused"));

    expect(response.status).toBe(404);
  });

  it("refuses a second workspace's attempt to claim an existing slug", async () => {
    await repository.createTrackedLink("workspace_1", { slug: "launch", destination: "https://victim.example/" });

    await expect(repository.createTrackedLink("workspace_2", {
      slug: "launch",
      destination: "https://attacker.example/",
    })).rejects.toThrow(/already used/);

    const response = await GET(new Request("http://localhost/r/launch"), context("launch"));
    expect(new URL(response.headers.get("location") ?? "").hostname).toBe("victim.example");
  });

  it("fires the conversion callback through the pinned, non-redirecting outbound helper", async () => {
    await repository.createTrackedLink("workspace_1", {
      slug: "convert",
      destination: "https://example.com/",
      conversionUrl: "https://hooks.example.com/conversion",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await GET(new Request("http://localhost/r/convert"), context("convert"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(response.status).toBe(302);
    expect(mocks.postJson).toHaveBeenCalledWith(
      "https://hooks.example.com/conversion",
      expect.objectContaining({ slug: "convert" }),
      expect.objectContaining({ timeoutMs: 5_000 }),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("ignores a client-supplied X-Forwarded-For when no trusted proxy is configured", async () => {
    await repository.createTrackedLink("workspace_1", { slug: "uniq", destination: "https://example.com/" });
    const recordClick = vi.spyOn(repository, "recordTrackedLinkClick");

    for (const forged of ["198.51.100.1", "198.51.100.2"]) {
      await GET(new Request("http://localhost/r/uniq", { headers: { "x-forwarded-for": forged } }), context("uniq"));
    }
    await new Promise((resolve) => setTimeout(resolve, 0));

    const hashes = recordClick.mock.calls.map(([, input]) => input.ipHash);
    expect(hashes).toEqual(["anon", "anon"]);
  });

  it("404s an unknown slug", async () => {
    const response = await GET(new Request("http://localhost/r/missing"), context("missing"));
    expect(response.status).toBe(404);
  });
});
