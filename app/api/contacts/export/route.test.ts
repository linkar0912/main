import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listCapturedContacts: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ listCapturedContacts: mocks.listCapturedContacts }) }));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { GET } = await import("./route");

describe("GET /api/contacts/export", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "u1", workspaceId: "w1" });
    mocks.listCapturedContacts.mockReset();
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("returns the literal export-feature contract before loading contacts", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "exports"));

    const response = await GET(new Request("https://app.linkar.in/api/contacts/export"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "exports" });
    expect(mocks.listCapturedContacts).not.toHaveBeenCalled();
  });
});
