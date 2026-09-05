import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createBillingService, BillingServiceError } from "./service";
import type { BillingRepository } from "./repository";

function repository(overrides: Partial<BillingRepository> = {}): BillingRepository {
  return {
    getBillingView: vi.fn().mockResolvedValue({ subscription: null, deliveriesUsed: 0, entitlementPlanKey: "free" }),
    claimCheckout: vi.fn().mockResolvedValue({ kind: "create", attemptId: "attempt_1" }),
    markCheckoutReady: vi.fn().mockResolvedValue(undefined),
    markCheckoutFailed: vi.fn().mockResolvedValue(undefined),
    markCheckoutVerified: vi.fn().mockResolvedValue(true),
    getSubscriptionForOwnerAction: vi.fn().mockResolvedValue({
      id: "billing_1",
      providerSubscriptionId: "sub_1",
      status: "ACTIVE",
    }),
    recordPendingPlanChange: vi.fn().mockResolvedValue(undefined),
    recordPendingCancellation: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const env = {
  razorpay: {
    keyId: "rzp_test_public",
    keySecret: "checkout-secret",
    webhookSecret: "webhook-secret",
    planIds: {
      creator: { MONTHLY: "plan_creator_monthly", ANNUAL: "plan_creator_annual" },
      growth: { MONTHLY: "plan_growth_monthly", ANNUAL: "plan_growth_annual" },
      agency: { MONTHLY: "plan_agency_monthly", ANNUAL: "plan_agency_annual" },
    },
  },
};

function provider() {
  return {
    createSubscription: vi.fn().mockResolvedValue({ id: "sub_1", status: "created" }),
    updateSubscription: vi.fn().mockResolvedValue({ id: "sub_1", status: "active" }),
    cancelSubscription: vi.fn().mockResolvedValue({ id: "sub_1", status: "active" }),
  };
}

describe("billing service", () => {
  it("audits owner billing mutations without secrets or payment data", async () => {
    const audit = vi.fn().mockResolvedValue(undefined);
    const service = createBillingService({ repository: repository(), provider: provider(), env, audit });
    const actor = {
      requestId: "billing_req_1", userId: "user_1", email: "owner@example.com",
      workspaceId: "ws_1", ipHash: "ip_hash", userAgent: "test", origin: "https://app.linkar.in",
    };

    await service.createCheckout("ws_1", "creator", "MONTHLY", actor);
    await service.schedulePlanChange("ws_1", "growth", "ANNUAL", { ...actor, requestId: "billing_req_2" });
    await service.cancelAtCycleEnd("ws_1", { ...actor, requestId: "billing_req_3" });

    expect(audit.mock.calls.map(([event]) => [event.action, event.phase])).toEqual([
      ["billing.checkout.create", "ATTEMPT"], ["billing.checkout.create", "SUCCESS"],
      ["billing.plan.change", "ATTEMPT"], ["billing.plan.change", "SUCCESS"],
      ["billing.subscription.cancel", "ATTEMPT"], ["billing.subscription.cancel", "SUCCESS"],
    ]);
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/checkout-secret|webhook-secret|payment/i);
  });

  it("creates a monthly subscription outside the checkout claim operation", async () => {
    const calls: string[] = [];
    const repo = repository({
      claimCheckout: vi.fn(async () => { calls.push("claim"); return { kind: "create" as const, attemptId: "attempt_1" }; }),
      markCheckoutReady: vi.fn(async () => { calls.push("ready"); }),
    });
    const gateway = provider();
    gateway.createSubscription.mockImplementation(async () => { calls.push("provider"); return { id: "sub_1", status: "created" }; });
    const service = createBillingService({ repository: repo, provider: gateway, env, now: () => new Date("2026-09-04T12:00:00Z") });

    await expect(service.createCheckout("ws_1", "creator", "MONTHLY")).resolves.toEqual({
      status: "ready",
      keyId: "rzp_test_public",
      subscriptionId: "sub_1",
      attemptId: "attempt_1",
    });
    expect(calls).toEqual(["claim", "provider", "ready"]);
    expect(gateway.createSubscription).toHaveBeenCalledWith({
      planId: "plan_creator_monthly",
      totalCount: 120,
      workspaceId: "ws_1",
      attemptId: "attempt_1",
    });
  });

  it("reports billing as unavailable when any trusted Razorpay mapping is missing", async () => {
    const service = createBillingService({
      repository: repository(),
      provider: provider(),
      env: { razorpay: { ...env.razorpay, planIds: { ...env.razorpay.planIds, agency: { ...env.razorpay.planIds.agency, ANNUAL: undefined } } } },
    });

    await expect(service.getBillingView("ws_1", "OWNER")).resolves.toMatchObject({
      billingConfigured: false,
      billingMissing: ["RAZORPAY_PLAN_AGENCY_ANNUAL_ID"],
    });
  });

  it("maps an incomplete plan mapping to the safe configuration error", async () => {
    const service = createBillingService({
      repository: repository(),
      provider: provider(),
      env: { razorpay: { ...env.razorpay, planIds: { ...env.razorpay.planIds, creator: { ...env.razorpay.planIds.creator, MONTHLY: undefined } } } },
    });

    await expect(service.createCheckout("ws_1", "creator", "MONTHLY")).rejects.toMatchObject({ code: "billing_not_configured" });
  });

  it("reuses a ready attempt and never creates a second provider subscription", async () => {
    const repo = repository({
      claimCheckout: vi.fn().mockResolvedValue({ kind: "reuse", attemptId: "attempt_1", subscriptionId: "sub_existing" }),
    });
    const gateway = provider();
    const service = createBillingService({ repository: repo, provider: gateway, env });

    await expect(service.createCheckout("ws_1", "creator", "MONTHLY")).resolves.toMatchObject({
      status: "ready",
      subscriptionId: "sub_existing",
    });
    expect(gateway.createSubscription).not.toHaveBeenCalled();
  });

  it("returns processing while another request creates the provider subscription", async () => {
    const repo = repository({ claimCheckout: vi.fn().mockResolvedValue({ kind: "processing", attemptId: "attempt_1" }) });
    const gateway = provider();
    const service = createBillingService({ repository: repo, provider: gateway, env });

    await expect(service.createCheckout("ws_1", "growth", "ANNUAL")).resolves.toEqual({
      status: "processing",
      attemptId: "attempt_1",
    });
    expect(gateway.createSubscription).not.toHaveBeenCalled();
  });

  it("rejects a different selection while another checkout remains open", async () => {
    const repo = repository({ claimCheckout: vi.fn().mockResolvedValue({ kind: "conflict", attemptId: "attempt_1" }) });
    const gateway = provider();
    const service = createBillingService({ repository: repo, provider: gateway, env });

    await expect(service.createCheckout("ws_1", "agency", "ANNUAL")).rejects.toMatchObject({
      code: "subscription_conflict",
    });
    expect(gateway.createSubscription).not.toHaveBeenCalled();
  });

  it("records only a sanitized failure code when provider creation fails", async () => {
    const repo = repository();
    const gateway = provider();
    gateway.createSubscription.mockRejectedValue(new Error("sensitive provider response"));
    const service = createBillingService({ repository: repo, provider: gateway, env });

    await expect(service.createCheckout("ws_1", "creator", "MONTHLY")).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(repo.markCheckoutFailed).toHaveBeenCalledWith("attempt_1", "provider_unavailable");
  });

  it("does not mark the claim failed after Razorpay succeeds but persistence fails", async () => {
    const repo = repository({ markCheckoutReady: vi.fn().mockRejectedValue(new Error("database unavailable")) });
    const service = createBillingService({ repository: repo, provider: provider(), env });

    await expect(service.createCheckout("ws_1", "creator", "MONTHLY")).rejects.toThrow("database unavailable");
    expect(repo.markCheckoutFailed).not.toHaveBeenCalled();
  });

  it("verifies checkout without granting an entitlement", async () => {
    const repo = repository();
    const gateway = provider();
    const service = createBillingService({ repository: repo, provider: gateway, env });
    const { createHmac } = await import("node:crypto");
    const signature = createHmac("sha256", "checkout-secret").update("pay_1|sub_1").digest("hex");

    await expect(service.verifyCheckout("ws_1", {
      paymentId: "pay_1",
      subscriptionId: "sub_1",
      signature,
    })).resolves.toEqual({ status: "processing" });
    expect(repo.markCheckoutVerified).toHaveBeenCalledWith("ws_1", "sub_1", expect.any(Date));
    expect(Object.keys(repo).some((key) => key.toLowerCase().includes("entitlement"))).toBe(false);
  });

  it("rejects invalid checkout signatures", async () => {
    const repo = repository();
    const service = createBillingService({ repository: repo, provider: provider(), env });

    await expect(service.verifyCheckout("ws_1", {
      paymentId: "pay_1", subscriptionId: "sub_1", signature: "0".repeat(64),
    })).rejects.toEqual(new BillingServiceError("invalid_checkout_signature"));
    expect(repo.markCheckoutVerified).not.toHaveBeenCalled();
  });

  it("schedules plan changes and cancellation without changing entitlement", async () => {
    const repo = repository();
    const gateway = provider();
    const service = createBillingService({ repository: repo, provider: gateway, env });

    await service.schedulePlanChange("ws_1", "growth", "ANNUAL");
    expect(gateway.updateSubscription).toHaveBeenCalledWith({ subscriptionId: "sub_1", planId: "plan_growth_annual" });
    expect(repo.recordPendingPlanChange).toHaveBeenCalledWith("billing_1", "plan_growth", "ANNUAL");

    await service.cancelAtCycleEnd("ws_1");
    expect(gateway.cancelSubscription).toHaveBeenCalledWith("sub_1");
    expect(repo.recordPendingCancellation).toHaveBeenCalledWith("billing_1");
  });

  it("maps a missing plan-change mapping to the safe configuration error", async () => {
    const service = createBillingService({
      repository: repository(),
      provider: provider(),
      env: { razorpay: { ...env.razorpay, planIds: { ...env.razorpay.planIds, growth: { ...env.razorpay.planIds.growth, ANNUAL: undefined } } } },
    });

    await expect(service.schedulePlanChange("ws_1", "growth", "ANNUAL"))
      .rejects.toMatchObject({ code: "billing_not_configured" });
  });
});
