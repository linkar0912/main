import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { RazorpayClient, RazorpayError } = await import("./razorpay-client");

describe("RazorpayClient", () => {
  const fetchMock = vi.fn();
  const client = new RazorpayClient({
    keyId: "rzp_test_public",
    keySecret: "provider-secret",
    timeoutMs: 1_000,
    fetchImpl: fetchMock,
  });

  beforeEach(() => fetchMock.mockReset());

  it("creates a bounded subscription with only trusted internal notes", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      id: "sub_123",
      status: "created",
      plan_id: "plan_creator_monthly",
      customer_id: null,
      current_start: null,
      current_end: null,
    }), { status: 200 }));

    const subscription = await client.createSubscription({
      planId: "plan_creator_monthly",
      totalCount: 120,
      workspaceId: "ws_1",
      attemptId: "attempt_1",
    });

    expect(subscription).toMatchObject({ id: "sub_123", status: "created", planId: "plan_creator_monthly" });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.razorpay.com/v1/subscriptions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: `Basic ${Buffer.from("rzp_test_public:provider-secret").toString("base64")}`,
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          plan_id: "plan_creator_monthly",
          total_count: 120,
          customer_notify: 1,
          notes: { workspace_id: "ws_1", attempt_id: "attempt_1" },
        }),
      }),
    );
  });

  it("schedules plan changes at cycle end", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      id: "sub_123",
      status: "active",
      plan_id: "plan_growth_annual",
    }), { status: 200 }));

    await client.updateSubscription({ subscriptionId: "sub_123", planId: "plan_growth_annual" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.razorpay.com/v1/subscriptions/sub_123",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          plan_id: "plan_growth_annual",
          schedule_change_at: "cycle_end",
          customer_notify: 1,
        }),
      }),
    );
  });

  it("schedules cancellation at cycle end", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: "sub_123", status: "active" }), { status: 200 }));

    await client.cancelSubscription("sub_123");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.razorpay.com/v1/subscriptions/sub_123/cancel",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ cancel_at_cycle_end: 1 }) }),
    );
  });

  it("normalizes provider failures without exposing response bodies or credentials", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({
      error: { description: "secret provider diagnostic" },
    }), { status: 503 }));

    const error = await client.createSubscription({
      planId: "plan_creator_monthly",
      totalCount: 120,
      workspaceId: "ws_1",
      attemptId: "attempt_1",
    }).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(RazorpayError);
    expect(error).toMatchObject({ code: "razorpay_request_failed", status: 503, retryable: true });
    expect(String(error)).not.toContain("secret provider diagnostic");
    expect(String(error)).not.toContain("provider-secret");
  });
});
