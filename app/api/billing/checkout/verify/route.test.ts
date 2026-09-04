import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), verify: vi.fn() }));
vi.mock("@/src/lib/billing/authorization", () => ({ requireBillingOwner: mocks.guard }));
vi.mock("@/src/lib/billing/service", () => ({ getBillingService: () => ({ verifyCheckout: mocks.verify }) }));
const { POST } = await import("./route");

describe("POST /api/billing/checkout/verify", () => {
  it("passes the exact Checkout response to server verification", async () => {
    mocks.guard.mockResolvedValue({ ok: true, session: { workspaceId: "ws_1" }, role: "OWNER" });
    mocks.verify.mockResolvedValue({ status: "processing" });
    const body = { razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: "a".repeat(64) };
    const response = await POST(new Request("https://app.linkar.in/api/billing/checkout/verify", { method: "POST", body: JSON.stringify(body) }));
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith("ws_1", { paymentId: "pay_1", subscriptionId: "sub_1", signature: "a".repeat(64) });
  });
});
