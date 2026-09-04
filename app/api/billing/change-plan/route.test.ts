import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), change: vi.fn() }));
vi.mock("@/src/lib/billing/authorization", () => ({ requireBillingOwner: mocks.guard }));
vi.mock("@/src/lib/billing/service", () => ({ getBillingService: () => ({ schedulePlanChange: mocks.change }) }));
const { POST } = await import("./route");

describe("POST /api/billing/change-plan", () => {
  it("requires an owner before scheduling the change", async () => {
    mocks.guard.mockResolvedValue({ ok: false, error: Response.json({ error: "forbidden" }, { status: 403 }) });
    const response = await POST(new Request("https://app.linkar.in/api/billing/change-plan", { method: "POST", body: JSON.stringify({ plan: "growth", interval: "ANNUAL" }) }));
    expect(response.status).toBe(403);
    expect(mocks.change).not.toHaveBeenCalled();
  });
});
