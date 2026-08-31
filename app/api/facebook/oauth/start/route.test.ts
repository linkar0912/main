import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listFacebookPages: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ listFacebookPages: mocks.listFacebookPages }) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  appUrl: "https://app.linkar.in",
  facebookAppId: "facebook-app",
  authSessionSecret: "test-secret-at-least-32-characters",
  facebookRedirectUri: "https://app.linkar.in/api/facebook/oauth/callback",
  facebookScopes: ["pages_manage_metadata"],
}) }));

const { GET } = await import("./route");

describe("GET /api/facebook/oauth/start", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", workspaceId: "w1" });
    mocks.listFacebookPages.mockReset().mockResolvedValue([]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("returns the literal Facebook-feature contract before leaving Linkar", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "facebook"));

    const response = await GET(new Request("https://app.linkar.in/api/facebook/oauth/start"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "facebook" });
  });
});
