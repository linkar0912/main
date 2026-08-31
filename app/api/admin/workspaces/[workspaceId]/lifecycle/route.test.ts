import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdminWrite: vi.fn(),
  setLifecycle: vi.fn(),
  appendAdminAuditEvent: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.requireAdminWrite }));
vi.mock("@/src/lib/admin/workspace-service", () => ({ setAdminWorkspaceLifecycle: mocks.setLifecycle }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.appendAdminAuditEvent }));

const { POST } = await import("./route");
const context = { params: Promise.resolve({ workspaceId: "w1" }) } as never;

describe("workspace lifecycle", () => {
  beforeEach(() => {
    mocks.requireAdminWrite.mockReset().mockResolvedValue({
      owner: { userId: "owner-id", email: "owner@linkar.in", sessionId: "s1", aal: "aal2" },
      action: "workspace.suspend", targetType: "workspace", targetId: "w1", reason: "abuse review",
      requestId: "req1", idempotencyKey: "workspace-life-001", origin: "https://app.linkar.in", ipHash: "hash", userAgent: "test",
    });
    mocks.setLifecycle.mockReset().mockResolvedValue({ id: "w1", status: "SUSPENDED", version: 2 });
    mocks.appendAdminAuditEvent.mockReset().mockResolvedValue(undefined);
  });

  it("suspends with the guarded reason and actor", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/admin/workspaces/w1/lifecycle", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUSPEND", version: 1 }),
    }), context);
    expect(response.status).toBe(200);
    expect(mocks.setLifecycle).toHaveBeenCalledWith("w1", expect.objectContaining({ reason: "abuse review", actorUserId: "owner-id" }));
  });

  it("returns missing reason before changing lifecycle", async () => {
    mocks.requireAdminWrite.mockRejectedValue({ status: 422, code: "reason_required" });
    const response = await POST(new Request("https://app.linkar.in/api/admin/workspaces/w1/lifecycle", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUSPEND", version: 1 }),
    }), context);
    expect(response.status).toBe(422);
    expect(mocks.setLifecycle).not.toHaveBeenCalled();
  });

  it("returns stale version without a silent retry", async () => {
    mocks.setLifecycle.mockRejectedValue({ status: 409, code: "stale_version" });
    const response = await POST(new Request("https://app.linkar.in/api/admin/workspaces/w1/lifecycle", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "RESTORE", version: 1 }),
    }), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "stale_version" });
  });
});
