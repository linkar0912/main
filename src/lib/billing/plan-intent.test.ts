import { describe, expect, it } from "vitest";
import type { OnboardingSummary } from "@/src/lib/onboarding/status";
import { signupHref } from "@/src/components/marketing/pricing-format";
import {
  describePlanIntent,
  onboardingExitPath,
  parsePlanIntent,
  planIntentBillingPath,
  planIntentCheckoutAction,
  planIntentRedirectPath,
  PLAN_INTENT_TTL_SECONDS,
  readPlanIntent,
  samePlanIntent,
  serializePlanIntent,
  withPlanIntentParams,
} from "./plan-intent";

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);
const done: OnboardingSummary = { required: false, flow: "owner", invite: false, planCard: true, goals: [], displayName: null };

describe("parsePlanIntent", () => {
  it("accepts every paid plan with either billing period, in any case", () => {
    expect(parsePlanIntent("creator", "monthly")).toEqual({ plan: "creator", interval: "MONTHLY" });
    expect(parsePlanIntent("growth", "annual")).toEqual({ plan: "growth", interval: "ANNUAL" });
    expect(parsePlanIntent("agency", "ANNUAL")).toEqual({ plan: "agency", interval: "ANNUAL" });
  });

  it("reads back exactly what the pricing page links carry, for both toggle positions", () => {
    for (const plan of ["creator", "growth", "agency"] as const) {
      for (const interval of ["MONTHLY", "ANNUAL"] as const) {
        const query = new URL(signupHref(plan, interval), "https://linkar.in").searchParams;
        expect(parsePlanIntent(query.get("plan"), query.get("interval"))).toEqual({ plan, interval });
      }
    }
  });

  it("treats a missing period as monthly", () => {
    expect(parsePlanIntent("growth", undefined)).toEqual({ plan: "growth", interval: "MONTHLY" });
    expect(parsePlanIntent("growth", null)).toEqual({ plan: "growth", interval: "MONTHLY" });
    expect(parsePlanIntent("growth", "")).toEqual({ plan: "growth", interval: "MONTHLY" });
  });

  it("rejects Free, unknown plans, prototype keys and unknown periods", () => {
    for (const plan of ["free", "enterprise", "Growth", "toString", "__proto__", "", null, undefined, 42]) {
      expect(parsePlanIntent(plan, "monthly")).toBeNull();
    }
    for (const interval of ["weekly", "yearly", "constructor", 12, ["monthly"]]) {
      expect(parsePlanIntent("growth", interval)).toBeNull();
    }
  });
});

describe("plan intent cookie value", () => {
  it("round-trips the plan and period", () => {
    const value = serializePlanIntent({ plan: "agency", interval: "ANNUAL" }, NOW);
    expect(value).toBe(`agency.annual.${NOW / 1000}`);
    expect(readPlanIntent(value, NOW + 60_000)).toEqual({ plan: "agency", interval: "ANNUAL" });
  });

  it("lapses after 24 hours even if the browser kept the cookie", () => {
    const value = serializePlanIntent({ plan: "growth", interval: "MONTHLY" }, NOW);
    expect(readPlanIntent(value, NOW + PLAN_INTENT_TTL_SECONDS * 1000)).not.toBeNull();
    expect(readPlanIntent(value, NOW + PLAN_INTENT_TTL_SECONDS * 1000 + 1000)).toBeNull();
  });

  it("refuses a value issued in the future or in the wrong shape", () => {
    expect(readPlanIntent(serializePlanIntent({ plan: "growth", interval: "MONTHLY" }, NOW + 60 * 60_000), NOW)).toBeNull();
    for (const value of ["", "growth", "growth.annual", "free.monthly.1", "growth.weekly.1", `growth.annual.${NOW / 1000};x`, "x".repeat(65), null, undefined]) {
      expect(readPlanIntent(value, NOW)).toBeNull();
    }
  });
});

describe("plan intent paths and copy", () => {
  const intent = { plan: "growth", interval: "ANNUAL" } as const;

  it("pre-selects the plan in Billing", () => {
    expect(planIntentBillingPath(intent)).toBe("/settings?section=billing&plan=growth&interval=annual");
  });

  it("adds the plan to an email confirmation link only when there is one", () => {
    expect(withPlanIntentParams(new URL("https://app.linkar.in/auth/confirm?type=signup"), intent).toString())
      .toBe("https://app.linkar.in/auth/confirm?type=signup&plan=growth&interval=annual");
    expect(withPlanIntentParams(new URL("https://app.linkar.in/auth/confirm?type=signup"), null).toString())
      .toBe("https://app.linkar.in/auth/confirm?type=signup");
  });

  it("names the plan and how it is billed", () => {
    expect(describePlanIntent(intent)).toBe("Growth plan, billed yearly");
    expect(describePlanIntent({ plan: "creator", interval: "MONTHLY" })).toBe("Creator plan, billed monthly");
  });

  it("compares intents by plan and period", () => {
    expect(samePlanIntent(intent, { plan: "growth", interval: "ANNUAL" })).toBe(true);
    expect(samePlanIntent(intent, { plan: "growth", interval: "MONTHLY" })).toBe(false);
    expect(samePlanIntent(intent, null)).toBe(false);
    expect(samePlanIntent(undefined, undefined)).toBe(false);
  });
});

describe("planIntentRedirectPath", () => {
  const intent = { plan: "creator", interval: "MONTHLY" } as const;

  it("hands the default landing pages over to Billing once onboarding is done", () => {
    expect(planIntentRedirectPath(intent, done, "/dashboard")).toBe("/settings?section=billing&plan=creator&interval=monthly");
    expect(planIntentRedirectPath(intent, done, "/automations")).toBe("/settings?section=billing&plan=creator&interval=monthly");
  });

  it("lets onboarding come first, and never redirects on an unknown onboarding state", () => {
    expect(planIntentRedirectPath(intent, { ...done, required: true }, "/dashboard")).toBeNull();
    expect(planIntentRedirectPath(intent, null, "/dashboard")).toBeNull();
    expect(planIntentRedirectPath(intent, undefined, "/dashboard")).toBeNull();
  });

  it("leaves deep links, Settings and the builder alone", () => {
    for (const path of ["/settings", "/automations/new", "/contacts", "/insights"]) {
      expect(planIntentRedirectPath(intent, done, path)).toBeNull();
    }
  });

  it("does nothing without an intent", () => {
    expect(planIntentRedirectPath(null, done, "/dashboard")).toBeNull();
    expect(planIntentRedirectPath(undefined, done, "/dashboard")).toBeNull();
  });
});

describe("onboardingExitPath", () => {
  it("sends Go to Home and Skip for now to the plan's checkout", () => {
    expect(onboardingExitPath("/dashboard", { plan: "agency", interval: "ANNUAL" })).toBe("/settings?section=billing&plan=agency&interval=annual");
  });

  it("keeps every other destination, and Home without an intent", () => {
    expect(onboardingExitPath("/automations/new?template=x", { plan: "agency", interval: "ANNUAL" })).toBe("/automations/new?template=x");
    expect(onboardingExitPath("/dashboard", null)).toBe("/dashboard");
  });
});

describe("planIntentCheckoutAction", () => {
  const intent = { plan: "growth", interval: "MONTHLY" } as const;
  const free = { canManage: true, billingConfigured: true, entitlementPlanKey: "free", subscription: null };

  it("opens checkout for an owner on Free with checkout set up", () => {
    expect(planIntentCheckoutAction(free, intent)).toBe("checkout");
    expect(planIntentCheckoutAction({ ...free, entitlementPlanKey: "creator" }, intent)).toBe("checkout");
  });

  it("shows the normal Billing view when the plan or a subscription is already there", () => {
    expect(planIntentCheckoutAction({ ...free, entitlementPlanKey: "growth" }, intent)).toBe("show");
    expect(planIntentCheckoutAction({ ...free, subscription: { status: "ACTIVE" } }, intent)).toBe("show");
    expect(planIntentCheckoutAction({ ...free, subscription: { status: "CREATED" } }, intent)).toBe("show");
  });

  it("never opens checkout for someone who cannot pay, or before checkout is set up", () => {
    expect(planIntentCheckoutAction({ ...free, canManage: false }, intent)).toBe("show");
    expect(planIntentCheckoutAction({ ...free, billingConfigured: false }, intent)).toBe("show");
  });
});
