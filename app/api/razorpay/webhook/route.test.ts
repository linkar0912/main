import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ process: vi.fn() }));
vi.mock("@/src/lib/billing/webhook", () => ({
  WebhookError: class WebhookError extends Error { constructor(public code: string) { super(code); } },
  getWebhookProcessor: () => ({ process: mocks.process }),
}));
const { POST, runtime } = await import("./route");

describe("POST /api/razorpay/webhook", () => {
  beforeEach(() => mocks.process.mockReset());

  it("passes exact body bytes and Razorpay idempotency headers to the processor", async () => {
    mocks.process.mockResolvedValue({ outcome: "applied" });
    const raw = '{"event":"subscription.activated", "spacing":"preserved"}';
    const response = await POST(new Request("https://app.linkar.in/api/razorpay/webhook", {
      method: "POST",
      headers: { "x-razorpay-event-id": "evt_1", "x-razorpay-signature": "a".repeat(64) },
      body: raw,
    }));
    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(mocks.process).toHaveBeenCalledWith({ eventId: "evt_1", signature: "a".repeat(64), rawBody: Buffer.from(raw) });
  });

  it("rejects missing verification headers", async () => {
    const response = await POST(new Request("https://app.linkar.in/api/razorpay/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
