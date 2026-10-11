import { describe, expect, it } from "vitest";

import { EntitlementOverridesSchema } from "@/src/lib/entitlements/types";
import { limitsFormFrom, overridesFrom, usageRow } from "./workspace-limits";

const usage = { memberCount: 4, automationCount: 18, instagramConnectionCount: 2, facebookConnectionCount: 1, deliveriesReserved: 18432, broadcastsCreated: 11 };

describe("custom limits form", () => {
  it("round-trips every override the API accepts, in the shape it accepts", () => {
    const overrides = { memberLimit: 12, sequenceLimit: null, monthlyDeliveryLimit: 0, exportsEnabled: false, teamEnabled: true };
    const result = overridesFrom(limitsFormFrom(overrides));
    expect(result).toEqual({ ok: true, overrides });
    expect(EntitlementOverridesSchema.parse(result.ok ? result.overrides : null)).toEqual(overrides);
  });

  it("serialises an untouched form for a plan-default workspace as {}", () => {
    expect(overridesFrom(limitsFormFrom({}))).toEqual({ ok: true, overrides: {} });
  });

  it("reads blank as the plan default, accepts thousands separators and rejects fractions", () => {
    const form = limitsFormFrom({});
    form.limits.monthlyDeliveryLimit.value = "30,000";
    form.limits.memberLimit.value = "  ";
    expect(overridesFrom(form)).toEqual({ ok: true, overrides: { monthlyDeliveryLimit: 30000 } });
    form.limits.automationLimit.value = "-1";
    expect(overridesFrom(form)).toMatchObject({ ok: false, key: "automationLimit" });
  });

  it("lets Unlimited win over a typed number", () => {
    const form = limitsFormFrom({ memberLimit: 5 });
    form.limits.memberLimit.unlimited = true;
    expect(overridesFrom(form)).toEqual({ ok: true, overrides: { memberLimit: null } });
  });
});

describe("usage rows", () => {
  it("summarises usage against the limit and grades it", () => {
    const effective = { memberLimit: 5, monthlyDeliveryLimit: 30000, sequenceLimit: null, monthlyBroadcastLimit: 0 };
    expect(usageRow("monthlyDeliveryLimit", usage, effective, { monthlyDeliveryLimit: 25000 }, { monthlyDeliveryLimit: 30000 })).toMatchObject({
      summary: "18,432 of 30,000 messages · 61%", tone: "normal", planDefault: 25000, custom: 30000,
    });
    expect(usageRow("memberLimit", usage, effective, {}, {})).toMatchObject({ summary: "4 of 5 members · 80%", tone: "warning", custom: undefined });
    expect(usageRow("sequenceLimit", usage, effective, {}, {})).toMatchObject({ summary: "Unlimited", percent: null, tone: "normal" });
    expect(usageRow("monthlyBroadcastLimit", { ...usage, broadcastsCreated: 0 }, effective, {}, {})).toMatchObject({ summary: "Not included", percent: null });
    expect(usageRow("memberLimit", { ...usage, memberCount: 6 }, effective, {}, {})).toMatchObject({ tone: "danger" });
  });
});
