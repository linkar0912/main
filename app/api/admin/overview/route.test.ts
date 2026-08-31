import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlatformOwnerSession: vi.fn(),
  loadAdminOverview: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/authorization", () => ({
  getPlatformOwnerSession: mocks.getPlatformOwnerSession,
}));
vi.mock("@/src/lib/admin/overview", () => ({
  loadAdminOverview: mocks.loadAdminOverview,
}));

const { GET } = await import("./route");

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    mocks.getPlatformOwnerSession.mockReset();
    mocks.loadAdminOverview.mockReset();
    mocks.getPlatformOwnerSession.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      email: "owner@linkar.in",
      sessionId: "session-1",
      aal: "aal2",
    });
    mocks.loadAdminOverview.mockResolvedValue({ workspaces: { active: 1, suspended: 0 }, operatorTape: [] });
  });

  it("requires an allowlisted AAL2 owner", async () => {
    mocks.getPlatformOwnerSession.mockRejectedValue({ status: 428, code: "mfa_required" });

    const response = await GET();

    expect(response.status).toBe(428);
    expect(await response.json()).toEqual({ error: "mfa_required" });
    expect(mocks.loadAdminOverview).not.toHaveBeenCalled();
  });

  it("does not disclose the overview to non-owners", async () => {
    mocks.getPlatformOwnerSession.mockRejectedValue({ status: 403, code: "forbidden" });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("returns a private no-store owner response", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ data: { workspaces: { active: 1, suspended: 0 }, operatorTape: [] } });
  });
});
