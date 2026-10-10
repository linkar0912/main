import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), entitlement: vi.fn(), usage: vi.fn(), premium: vi.fn(), plan: vi.fn(), planUpdate: vi.fn(), entitlementUpdate: vi.fn(), entitlementCount: vi.fn(), redemptionUpdate: vi.fn(), redemptionCount: vi.fn(), redemption: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  planDefinition: { create: mocks.create, findUnique: mocks.plan, updateMany: mocks.planUpdate },
  workspaceEntitlement: { findUnique: mocks.entitlement, updateMany: mocks.entitlementUpdate, count: mocks.entitlementCount },
  workspaceUsagePeriod: { findUnique: mocks.usage },
  premiumInviteRedemption: { findFirst: mocks.premium, updateMany: mocks.redemptionUpdate, count: mocks.redemptionCount, findUniqueOrThrow: mocks.redemption },
} }));
const { createAdminPlan, endAdminPremiumAccess, loadAdminWorkspaceEntitlement, retireAdminPlan, updateAdminWorkspaceEntitlement } = await import("./plan-service");
const values = { name: "Growth", memberLimit: 5, automationLimit: 50, instagramConnectionLimit: 5,
  facebookConnectionLimit: 5, sequenceLimit: 25, monthlyBroadcastLimit: 10, monthlyDeliveryLimit: 25000,
  sequencesEnabled: true, broadcastsEnabled: true, trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: true };
beforeEach(() => { vi.clearAllMocks(); mocks.usage.mockResolvedValue(null); mocks.premium.mockResolvedValue(null); });
describe("admin plan services", () => {
  it("creates a strict plan with a normalized key", async () => {
    mocks.create.mockImplementation(async ({ data }) => ({ ...data, createdAt: new Date(), updatedAt: new Date(), _count: { workspaceEntitlements: 0 } }));
    expect(await createAdminPlan({ ...values, key: "Launch" })).toMatchObject({ key: "launch", name: "Growth" });
    expect(mocks.create).toHaveBeenCalledOnce();
  });
  it("keeps editable base-plan data but reports premium effective limits without base overrides", async () => {
    mocks.entitlement.mockResolvedValue({ plan: { ...values, id: "base", key: "free", monthlyDeliveryLimit: 100 }, overrides: { monthlyDeliveryLimit: 1 }, version: 2 });
    mocks.premium.mockResolvedValue({ plan: { ...values, id: "premium", key: "growth" }, expiresAt: new Date("2027-01-01") });
    const result = await loadAdminWorkspaceEntitlement("w1");
    expect(result.plan.id).toBe("base");
    expect(result.overrides.monthlyDeliveryLimit).toBe(1);
    expect(result.effective.monthlyDeliveryLimit).toBe(25000);
    expect(result.effectivePlan.key).toBe("growth");
    expect(result.premiumExpiresAt).toBe("2027-01-01T00:00:00.000Z");
  });
  it("applies base overrides when premium access expires", async () => {
    mocks.entitlement.mockResolvedValue({ plan: { ...values, id: "base", key: "free" }, overrides: { monthlyDeliveryLimit: 1 }, version: 2 });
    expect((await loadAdminWorkspaceEntitlement("w1")).effective.monthlyDeliveryLimit).toBe(1);
    expect(mocks.premium.mock.calls[0][0].where.expiresAt.gt).toBeInstanceOf(Date);
  });
});

describe("plan lifecycle guards", () => {
  it("keeps a workspace on its current retired plan while overrides change", async () => {
    mocks.plan.mockResolvedValue({ id: "legacy", isActive: false });
    mocks.entitlement.mockResolvedValueOnce({ planId: "legacy" }).mockResolvedValue({ plan: { ...values, id: "legacy", key: "legacy" }, overrides: {}, version: 3 });
    mocks.entitlementUpdate.mockResolvedValue({ count: 1 });
    await expect(updateAdminWorkspaceEntitlement("w1", { planId: "legacy", overrides: { automationLimit: 9 }, version: 2 })).resolves.toMatchObject({ plan: { id: "legacy" } });
    expect(mocks.entitlementUpdate).toHaveBeenCalledOnce();
  });
  it("refuses to newly assign a retired plan", async () => {
    mocks.plan.mockResolvedValue({ id: "legacy", isActive: false });
    mocks.entitlement.mockResolvedValue({ planId: "free-plan" });
    await expect(updateAdminWorkspaceEntitlement("w1", { planId: "legacy", overrides: {}, version: 2 })).rejects.toMatchObject({ status: 409, code: "plan_retired" });
    expect(mocks.entitlementUpdate).not.toHaveBeenCalled();
  });
  it("never retires the default free plan", async () => {
    mocks.plan.mockResolvedValue({ key: "free" });
    await expect(retireAdminPlan("plan_free", 1)).rejects.toMatchObject({ status: 409, code: "default_plan_protected" });
    expect(mocks.planUpdate).not.toHaveBeenCalled();
  });
  it("ends active premium access early and reports a missing redemption", async () => {
    mocks.redemptionUpdate.mockResolvedValueOnce({ count: 1 });
    mocks.redemption.mockResolvedValue({ workspaceId: "w1", expiresAt: new Date("2026-10-10T00:00:00.000Z") });
    await expect(endAdminPremiumAccess("code1")).resolves.toEqual({ codeId: "code1", workspaceId: "w1", endedAt: "2026-10-10T00:00:00.000Z" });
    expect(mocks.redemptionUpdate.mock.calls[0][0].where).toMatchObject({ codeId: "code1", expiresAt: { gt: expect.any(Date) } });
    mocks.redemptionUpdate.mockResolvedValueOnce({ count: 0 });
    mocks.redemptionCount.mockResolvedValue(0);
    await expect(endAdminPremiumAccess("missing")).rejects.toMatchObject({ status: 404, code: "premium_redemption_not_found" });
  });
});
