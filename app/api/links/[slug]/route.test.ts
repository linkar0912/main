import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));
let repository = createMemoryRepository();

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { DELETE } = await import("./route");

const context = (slug: string) => ({ params: Promise.resolve({ slug }) });

describe("DELETE /api/links/[slug]", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", workspaceId: "w1", email: "a@example.com" });
  });

  it("deletes the caller's own link by slug", async () => {
    await repository.createTrackedLink("w1", { slug: "mine", destination: "https://example.com/" });

    const response = await DELETE(new Request("https://app.linkar.in/api/links/mine", { method: "DELETE" }), context("mine"));

    expect(response.status).toBe(200);
    expect(await repository.getTrackedLinkBySlug("w1", "mine")).toBeNull();
  });

  it("treats another workspace's slug as not found and leaves it intact", async () => {
    await repository.createTrackedLink("w2", { slug: "theirs", destination: "https://example.com/" });

    const response = await DELETE(new Request("https://app.linkar.in/api/links/theirs", { method: "DELETE" }), context("theirs"));

    expect(response.status).toBe(404);
    expect(await repository.getTrackedLinkBySlug("w2", "theirs")).not.toBeNull();
  });

  it("rejects a cross-site request before touching the session", async () => {
    const response = await DELETE(new Request("https://app.linkar.in/api/links/mine", {
      method: "DELETE",
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    }), context("mine"));

    expect(response.status).toBe(403);
    expect(mocks.getValidatedSession).not.toHaveBeenCalled();
  });
});
