import type { ServerEnv } from "@/src/lib/env";
import type { BillingCatalogPlan, BillingInterval, BillingPlanKey } from "./types";

export const BILLING_PLANS = {
  creator: {
    key: "creator",
    name: "Creator",
    monthlyPaise: 19_900,
    annualPaise: 199_000,
    memberLimit: 2,
    automationLimit: 20,
    instagramConnectionLimit: 2,
    facebookConnectionLimit: 2,
    sequenceLimit: 10,
    monthlyBroadcastLimit: 0,
    monthlyDeliveryLimit: 5_000,
    features: ["Sequences", "Tracked links", "2 team seats"],
  },
  growth: {
    key: "growth",
    name: "Growth",
    monthlyPaise: 49_900,
    annualPaise: 499_000,
    memberLimit: 5,
    automationLimit: 50,
    instagramConnectionLimit: 5,
    facebookConnectionLimit: 5,
    sequenceLimit: 25,
    monthlyBroadcastLimit: 10,
    monthlyDeliveryLimit: 25_000,
    features: ["Broadcasts", "Exports", "5 team seats"],
  },
  agency: {
    key: "agency",
    name: "Agency",
    monthlyPaise: 99_900,
    annualPaise: 999_000,
    memberLimit: 10,
    automationLimit: 100,
    instagramConnectionLimit: 10,
    facebookConnectionLimit: 10,
    sequenceLimit: 50,
    monthlyBroadcastLimit: 25,
    monthlyDeliveryLimit: 50_000,
    features: ["All launch features", "10 team seats", "Priority capacity"],
  },
} as const satisfies Record<BillingPlanKey, BillingCatalogPlan>;

export function getBillingPlan(value: unknown): BillingCatalogPlan | null {
  if (typeof value !== "string" || !(value in BILLING_PLANS)) return null;
  return BILLING_PLANS[value as BillingPlanKey];
}

export function resolveRazorpayPlanId(
  plan: BillingPlanKey,
  interval: BillingInterval,
  env: Pick<ServerEnv, "razorpay">,
): string {
  const providerPlanId = env.razorpay.planIds[plan][interval];
  if (!providerPlanId) throw new Error("razorpay_plan_not_configured");
  return providerPlanId;
}
