import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { BILLING_PLANS, FREE_BILLING_PLAN, getBillingPlan, resolveLinkarPlanFromRazorpayId, resolveRazorpayPlanId } from "./catalog";

const LIMIT_COLUMNS = [
  "memberLimit", "automationLimit", "instagramConnectionLimit", "facebookConnectionLimit",
  "sequenceLimit", "monthlyBroadcastLimit", "monthlyDeliveryLimit",
] as const;
const FLAG_COLUMNS = [
  "sequencesEnabled", "broadcastsEnabled", "trackedLinksEnabled", "teamEnabled", "facebookEnabled", "exportsEnabled",
] as const;
type SeededPlan = Record<string, string | number | boolean | null>;

/** PlanDefinition rows from prisma/seed.ts, the values local and fresh databases enforce. */
function seededPlans(): Record<string, SeededPlan> {
  const seed = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
  const rows = [...seed.matchAll(/\{ id: "plan_[^}]+\}/g)].map(([literal]) => JSON.parse(
    literal.replace(/(\w+):/g, "\"$1\":").replace(/(\d)_(\d)/g, "$1$2"),
  ) as SeededPlan);
  return Object.fromEntries(rows.map((row) => [row.key as string, row]));
}

/** PlanDefinition rows upserted into production by the Razorpay billing migration. */
function migratedPlans(): Record<string, SeededPlan> {
  const migration = readFileSync(join(process.cwd(), "prisma/migrations/20260904190000_razorpay_billing/migration.sql"), "utf8");
  const insert = migration.slice(migration.indexOf("INSERT INTO \"PlanDefinition\""));
  const columns = [...insert.slice(0, insert.indexOf(")")).matchAll(/"(\w+)"/g)].map(([, name]) => name).slice(1);
  const rows = [...insert.matchAll(/\('(plan_\w+)'[^)]*\)/g)].map(([tuple]) => {
    const values = tuple.slice(1, -1).split(",").map((value) => value.trim());
    return Object.fromEntries(columns.map((column, index) => {
      const value = values[index];
      if (value === "true" || value === "false") return [column, value === "true"];
      if (/^\d+$/.test(value)) return [column, Number(value)];
      return [column, value.replace(/^'|'$/g, "")];
    })) as SeededPlan;
  });
  return Object.fromEntries(rows.map((row) => [row.key as string, row]));
}

// Advertised feature claims that correspond to an enforced entitlement flag.
const FEATURE_FLAGS: Record<string, (typeof FLAG_COLUMNS)[number]> = {
  Sequences: "sequencesEnabled",
  "Tracked links": "trackedLinksEnabled",
  Broadcasts: "broadcastsEnabled",
  Exports: "exportsEnabled",
};

describe("billing catalog matches enforced plan definitions", () => {
  for (const [source, load] of [["prisma/seed.ts", seededPlans], ["migration 20260904190000", migratedPlans]] as const) {
    it(`advertises exactly the limits ${source} enforces`, () => {
      const plans = load();
      expect(Object.keys(plans).sort()).toEqual(["agency", "creator", "free", "growth"]);
      for (const catalogPlan of [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)]) {
        const enforced = plans[catalogPlan.key];
        expect(enforced, catalogPlan.key).toBeDefined();
        expect(enforced.name).toBe(catalogPlan.name);
        expect(enforced.id).toBe(`plan_${catalogPlan.key}`);
        for (const column of LIMIT_COLUMNS) expect(enforced[column], `${catalogPlan.key}.${column}`).toBe(catalogPlan[column]);
        for (const feature of catalogPlan.features) {
          const flag = FEATURE_FLAGS[feature];
          if (flag) expect(enforced[flag], `${catalogPlan.key} advertises ${feature}`).toBe(true);
        }
        expect(enforced.teamEnabled, `${catalogPlan.key}.teamEnabled`).toBe(catalogPlan.memberLimit > 1);
      }
    });
  }
});

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
  it("keeps the public free tier in the shared catalog", () => {
    expect(FREE_BILLING_PLAN).toMatchObject({
      key: "free",
      monthlyPaise: 0,
      annualPaise: 0,
      monthlyDeliveryLimit: 1_000,
      automationLimit: 5,
      instagramConnectionLimit: 1,
      facebookConnectionLimit: 1,
      memberLimit: 1,
    });
  });

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

  it("maps webhook provider plan IDs back to the trusted Linkar catalog", () => {
    expect(resolveLinkarPlanFromRazorpayId("plan_growth_annual", configuredEnv)).toEqual({
      plan: "growth",
      planId: "plan_growth",
      interval: "ANNUAL",
    });
    expect(resolveLinkarPlanFromRazorpayId("plan_attacker", configuredEnv)).toBeNull();
  });
});
