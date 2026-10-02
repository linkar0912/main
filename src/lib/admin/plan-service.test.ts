import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), entitlement: vi.fn(), usage: vi.fn(), premium: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/prisma", () => ({ prisma: {
  planDefinition: { create: mocks.create }, workspaceEntitlement: { findUnique: mocks.entitlement },
  workspaceUsagePeriod: { findUnique: mocks.usage }, premiumInviteRedemption: { findFirst: mocks.premium },
} }));
const { createAdminPlan, loadAdminWorkspaceEntitlement } = await import("./plan-service");
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
