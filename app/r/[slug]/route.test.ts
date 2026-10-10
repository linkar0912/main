import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

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
