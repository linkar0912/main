import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { GET } = await import("./route");

const context = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("GET /r/[slug]", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
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

  it("410s an expired link before touching the destination", async () => {
    await repository.createTrackedLink("workspace_1", {
      slug: "old",
      destination: "https://example.com/",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });

    const response = await GET(new Request("http://localhost/r/old"), context("old"));

    expect(response.status).toBe(410);
  });

  it("404s an unknown slug", async () => {
    const response = await GET(new Request("http://localhost/r/missing"), context("missing"));
    expect(response.status).toBe(404);
  });
});
