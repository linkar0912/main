import { describe, expect, it } from "vitest";

import { BILLING_PLANS, getBillingPlan, resolveRazorpayPlanId } from "./catalog";

const configuredEnv = {
  razorpay: {
    keyId: "rzp_test_public",
    keySecret: "test-secret",
    webhookSecret: "webhook-secret",
    planIds: {
      creator: { MONTHLY: "plan_creator_monthly", ANNUAL: "plan_creator_annual" },
      growth: { MONTHLY: "plan_growth_monthly", ANNUAL: "plan_growth_annual" },
      agency: { MONTHLY: "plan_agency_monthly", ANNUAL: "plan_agency_annual" },
    },
  },
};

describe("Linkar billing catalog", () => {
  it("keeps the launch pricing and generous delivery limits server-authoritative", () => {
    expect(BILLING_PLANS.creator).toMatchObject({
      monthlyPaise: 19_900,
      annualPaise: 199_000,
      monthlyDeliveryLimit: 5_000,
    });
    expect(BILLING_PLANS.growth).toMatchObject({
      monthlyPaise: 49_900,
      annualPaise: 499_000,
      monthlyDeliveryLimit: 25_000,
    });
    expect(BILLING_PLANS.agency).toMatchObject({
      monthlyPaise: 99_900,
      annualPaise: 999_000,
      monthlyDeliveryLimit: 50_000,
    });
  });

  it("rejects plan keys that are not part of the launch catalog", () => {
    expect(getBillingPlan("free")).toBeNull();
    expect(getBillingPlan("unknown")).toBeNull();
    expect(getBillingPlan({ key: "creator" })).toBeNull();
  });

  it("resolves only the configured provider plan for the selected tier and interval", () => {
    expect(resolveRazorpayPlanId("creator", "MONTHLY", configuredEnv)).toBe("plan_creator_monthly");
    expect(resolveRazorpayPlanId("agency", "ANNUAL", configuredEnv)).toBe("plan_agency_annual");
  });

  it("fails closed when the selected provider plan is not configured", () => {
    expect(() => resolveRazorpayPlanId("creator", "MONTHLY", {
      razorpay: { planIds: { creator: {}, growth: {}, agency: {} } },
    })).toThrow("razorpay_plan_not_configured");
  });
});
