import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listConnections: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ listConnections: mocks.listConnections }) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({
  appUrl: "https://app.linkar.in",
  metaAppId: "meta-app",
  authSessionSecret: "test-secret-at-least-32-characters",
  metaRedirectUri: "https://app.linkar.in/api/meta/oauth/callback",
  metaScopes: ["instagram_business_basic"],
}) }));

const { GET } = await import("./route");

describe("GET /api/meta/oauth/start", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", workspaceId: "w1" });
    mocks.listConnections.mockReset().mockResolvedValue([{ id: "ig1" }]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("returns the literal Instagram-limit contract before leaving Linkar", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "instagram", 1, 1));

    const response = await GET(new Request("https://app.linkar.in/api/meta/oauth/start"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "instagram", used: 1, limit: 1 });
  });
});
