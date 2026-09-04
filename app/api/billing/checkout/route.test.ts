import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), checkout: vi.fn() }));
vi.mock("@/src/lib/billing/authorization", () => ({ requireBillingOwner: mocks.guard }));
vi.mock("@/src/lib/billing/service", () => ({ getBillingService: () => ({ createCheckout: mocks.checkout }) }));
const { POST, runtime } = await import("./route");

describe("POST /api/billing/checkout", () => {
  beforeEach(() => {
    mocks.guard.mockReset().mockResolvedValue({ ok: true, session: { workspaceId: "ws_1" }, role: "OWNER" });
    mocks.checkout.mockReset().mockResolvedValue({ status: "ready", keyId: "rzp_test_public", subscriptionId: "sub_1", attemptId: "attempt_1" });
  });
  it("accepts only a trusted plan key and interval", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/billing/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "creator", interval: "MONTHLY" }),
    }));
    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(mocks.checkout).toHaveBeenCalledWith("ws_1", "creator", "MONTHLY", undefined);
  });
  it("rejects amounts and provider IDs supplied by the browser", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/billing/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan: "creator", interval: "MONTHLY", amount: 1, planId: "plan_attacker" }),
    }));
    expect(response.status).toBe(422);
    expect(mocks.checkout).not.toHaveBeenCalled();
  });
});
