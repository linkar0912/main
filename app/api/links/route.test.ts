import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  createTrackedLink: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ createTrackedLink: mocks.createTrackedLink }) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { POST } = await import("./route");

describe("POST /api/links", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", workspaceId: "w1" });
    mocks.createTrackedLink.mockReset();
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("returns the literal tracked-link feature contract", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "tracked_links"));

    const response = await POST(new Request("https://app.linkar.in/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "guide", destination: "https://example.com/guide" }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "tracked_links" });
    expect(mocks.createTrackedLink).not.toHaveBeenCalled();
  });
});
