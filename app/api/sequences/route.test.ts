import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  listSequences: vi.fn(),
  countEnrollmentsBySequence: vi.fn(),
  createSequence: vi.fn(),
  assertEntitled: vi.fn(),
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    listSequences: mocks.listSequences,
    countEnrollmentsBySequence: mocks.countEnrollmentsBySequence,
    createSequence: mocks.createSequence,
  }),
}));

const { GET, POST } = await import("./route");

describe("/api/sequences session validation", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.listSequences.mockReset().mockResolvedValue([]);
    mocks.countEnrollmentsBySequence.mockReset().mockResolvedValue([]);
    mocks.createSequence.mockReset();
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a revoked session before listing sequences", async () => {
    const response = await GET(new Request("http://localhost/api/sequences"));
    expect(response.status).toBe(401);
    expect(mocks.listSequences).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before creating a sequence", async () => {
    const response = await POST(new Request("http://localhost/api/sequences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Follow up", status: "DRAFT", steps: [{ id: "step_1", delayHours: 0, text: "Hello" }] }),
    }));
    expect(response.status).toBe(401);
    expect(mocks.createSequence).not.toHaveBeenCalled();
  });

  it("returns the literal sequence-feature contract", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("entitlement_required", "sequences"));

    const response = await POST(new Request("http://localhost/api/sequences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Follow up", status: "DRAFT", steps: [{ id: "step_1", delayHours: 0, text: "Hello" }] }),
    }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "entitlement_required", capability: "sequences" });
  });
});
