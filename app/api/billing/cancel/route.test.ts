import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), cancel: vi.fn() }));
vi.mock("@/src/lib/billing/authorization", () => ({ requireBillingOwner: mocks.guard }));
vi.mock("@/src/lib/billing/service", () => ({ getBillingService: () => ({ cancelAtCycleEnd: mocks.cancel }) }));
const { POST } = await import("./route");

describe("POST /api/billing/cancel", () => {
  it("schedules owner cancellation at the cycle boundary", async () => {
    mocks.guard.mockResolvedValue({ ok: true, session: { workspaceId: "ws_1" }, role: "OWNER" });
    mocks.cancel.mockResolvedValue({ status: "scheduled" });
    const response = await POST(new Request("https://app.linkar.in/api/billing/cancel", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.cancel).toHaveBeenCalledWith("ws_1");
  });
});
