import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { createWebhookProcessor, entitlementPlanForEvent, isStaleProviderEvent, normalizeRazorpaySubscriptionEvent, WebhookError } = await import("./webhook");

const env = {
  razorpay: {
    webhookSecret: "webhook-secret",
    planIds: {
      creator: { MONTHLY: "plan_creator_monthly", ANNUAL: "plan_creator_annual" },
      growth: { MONTHLY: "plan_growth_monthly", ANNUAL: "plan_growth_annual" },
      agency: { MONTHLY: "plan_agency_monthly", ANNUAL: "plan_agency_annual" },
    },
  },
};

function body(event = "subscription.activated", overrides: Record<string, unknown> = {}): Buffer {
  return Buffer.from(JSON.stringify({
    event,
    created_at: 1_788_528_000,
    payload: {
      subscription: {
        entity: {
          id: "sub_1",
          plan_id: "plan_creator_monthly",
          customer_id: "cust_1",
          status: event.split(".")[1],
          current_start: 1_788_528_000,
          current_end: 1_791_120_000,
          notes: { workspace_id: "ws_1", attempt_id: "attempt_1" },
          ...overrides,
        },
      },
    },
  }));
}

function signature(rawBody: Buffer): string {
  return createHmac("sha256", "webhook-secret").update(rawBody).digest("hex");
}

describe("Razorpay webhook processing", () => {
  it("normalizes only the subscription fields Linkar needs", () => {
    const normalized = normalizeRazorpaySubscriptionEvent(JSON.parse(body().toString("utf8")), env);
    expect(normalized).toMatchObject({
      eventType: "subscription.activated",
      subscriptionId: "sub_1",
      linkarPlanId: "plan_creator",
      interval: "MONTHLY",
      providerStatus: "activated",
      workspaceId: "ws_1",
      attemptId: "attempt_1",
    });
    expect(normalized).not.toHaveProperty("payload");
  });

  it("ignores unknown event types but rejects malformed relevant events", () => {
    expect(normalizeRazorpaySubscriptionEvent({ event: "payment.authorized" }, env)).toBeNull();
    expect(() => normalizeRazorpaySubscriptionEvent({ event: "subscription.activated", payload: {} }, env)).toThrow("invalid_webhook_payload");
  });

  it("grants paid access only for activated or charged events", () => {
    const active = normalizeRazorpaySubscriptionEvent(JSON.parse(body().toString("utf8")), env)!;
    const authenticated = normalizeRazorpaySubscriptionEvent(JSON.parse(body("subscription.authenticated").toString("utf8")), env)!;
    expect(entitlementPlanForEvent(active, "plan_free", new Date("2026-09-04T12:00:00Z"))).toBe("plan_creator");
    expect(entitlementPlanForEvent(authenticated, "plan_free", new Date("2026-09-04T12:00:00Z"))).toBe("plan_free");
  });

  it("retains paid access through paid-through and returns to Free afterward", () => {
    const cancelled = normalizeRazorpaySubscriptionEvent(JSON.parse(body("subscription.cancelled").toString("utf8")), env)!;
    expect(entitlementPlanForEvent(cancelled, "plan_creator", new Date("2026-09-20T00:00:00Z"))).toBe("plan_creator");
    expect(entitlementPlanForEvent(cancelled, "plan_creator", new Date("2026-10-10T00:00:00Z"))).toBe("plan_free");
  });

  it("rejects older events and deterministically orders equal timestamps", () => {
    const lastAt = new Date("2026-09-04T12:00:00Z");
    expect(isStaleProviderEvent(lastAt, "evt_b", new Date("2026-09-04T11:59:59Z"), "evt_z")).toBe(true);
    expect(isStaleProviderEvent(lastAt, "evt_b", lastAt, "evt_a")).toBe(true);
    expect(isStaleProviderEvent(lastAt, "evt_b", lastAt, "evt_c")).toBe(false);
  });

  it("verifies exact raw bytes and invalidates only after an applied event", async () => {
    const applyEvent = vi.fn().mockResolvedValue({ outcome: "applied", workspaceId: "ws_1" });
    const invalidate = vi.fn();
    const processor = createWebhookProcessor({ repository: { applyEvent }, env, invalidate, now: () => new Date("2026-09-04T12:00:00Z") });
    const rawBody = body();

    await expect(processor.process({ eventId: "evt_1", rawBody, signature: signature(rawBody) })).resolves.toEqual({ outcome: "applied" });
    expect(applyEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_1", payloadHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect(invalidate).toHaveBeenCalledWith("ws_1");

    await expect(processor.process({ eventId: "evt_2", rawBody, signature: "0".repeat(64) })).rejects.toEqual(new WebhookError("invalid_webhook_signature"));
  });
});
