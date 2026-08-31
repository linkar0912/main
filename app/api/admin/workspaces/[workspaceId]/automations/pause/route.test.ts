import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdminWrite: vi.fn(), pause: vi.fn(), appendAdminAuditEvent: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/admin/request-guard", () => ({ requireAdminWrite: mocks.requireAdminWrite }));
vi.mock("@/src/lib/admin/workspace-service", () => ({ pauseAdminWorkspaceAutomations: mocks.pause }));
vi.mock("@/src/lib/admin/audit", () => ({ appendAdminAuditEvent: mocks.appendAdminAuditEvent }));

const { POST } = await import("./route");

describe("pause workspace automations", () => {
  it("returns the partial active-only pause count", async () => {
    mocks.requireAdminWrite.mockResolvedValue({
      owner: { userId: "owner", email: "owner@linkar.in", sessionId: "s", aal: "aal2" },
      action: "workspace.automations.pause_all", targetType: "workspace", targetId: "w1", reason: "incident response",
      requestId: "req", idempotencyKey: "pause-all-workspace", origin: "https://app.linkar.in", ipHash: "hash", userAgent: "test",
    });
    mocks.pause.mockResolvedValue({ paused: 3, version: 4 });
    mocks.appendAdminAuditEvent.mockResolvedValue(undefined);
    const response = await POST(new Request("https://app.linkar.in/api/admin/workspaces/w1/automations/pause", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: 3 }),
    }), { params: Promise.resolve({ workspaceId: "w1" }) } as never);
    expect(await response.json()).toEqual({ data: { paused: 3, version: 4 } });
  });
});
