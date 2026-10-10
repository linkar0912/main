import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPrismaEntitlementRepository, higherPlan } from "./repository";

const free = {
  key: "free", name: "Free", memberLimit: 1, automationLimit: 5, instagramConnectionLimit: 1,
  facebookConnectionLimit: 1, sequenceLimit: 0, monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 1_000,
  sequencesEnabled: false, broadcastsEnabled: false, trackedLinksEnabled: false, teamEnabled: false,
  facebookEnabled: true, exportsEnabled: false,
};
const creator = { ...free, key: "creator", name: "Creator", memberLimit: 2, automationLimit: 20, monthlyDeliveryLimit: 5_000, sequencesEnabled: true };
const agency = { ...free, key: "agency", name: "Agency", memberLimit: 10, automationLimit: 100, monthlyDeliveryLimit: 50_000, sequencesEnabled: true };

describe("Prisma entitlement repository", () => {
  it("uses an active premium redemption over the paid/base plan", async () => {
    const client = {
      workspaceEntitlement: { findUnique: vi.fn().mockResolvedValue({ overrides: {}, plan: free }) },
      premiumInviteRedemption: { findFirst: vi.fn().mockResolvedValue({ plan: agency }) },
    };
    const repository = createPrismaEntitlementRepository(client as never, () => new Date("2026-09-05T00:00:00Z"));
    await expect(repository.getWorkspaceEntitlement("ws_1")).resolves.toMatchObject({ plan: { key: "agency", automationLimit: 100 } });
  });

  it("never lets an invite downgrade a higher paid plan", async () => {
    const client = {
      workspaceEntitlement: { findUnique: vi.fn().mockResolvedValue({ overrides: {}, plan: agency }) },
      premiumInviteRedemption: { findFirst: vi.fn().mockResolvedValue({ plan: creator }) },
    };
    const repository = createPrismaEntitlementRepository(client as never, () => new Date("2026-09-05T00:00:00Z"));
    await expect(repository.getWorkspaceEntitlement("ws_1")).resolves.toMatchObject({ plan: { key: "agency", automationLimit: 100 } });
  });

  it("keeps admin overrides while an invite lifts the plan", async () => {
    const client = {
      workspaceEntitlement: { findUnique: vi.fn().mockResolvedValue({ overrides: { monthlyDeliveryLimit: 80_000 }, plan: free }) },
      premiumInviteRedemption: { findFirst: vi.fn().mockResolvedValue({ plan: agency }) },
    };
    const repository = createPrismaEntitlementRepository(client as never, () => new Date("2026-09-05T00:00:00Z"));
    await expect(repository.getWorkspaceEntitlement("ws_1")).resolves.toMatchObject({
      plan: { key: "agency" }, overrides: { monthlyDeliveryLimit: 80_000 },
    });
  });

  it("falls back automatically when no premium redemption is active", async () => {
    const client = {
      workspaceEntitlement: { findUnique: vi.fn().mockResolvedValue({ overrides: { automationLimit: 7 }, plan: free }) },
      premiumInviteRedemption: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const repository = createPrismaEntitlementRepository(client as never, () => new Date("2026-10-06T00:00:00Z"));
    await expect(repository.getWorkspaceEntitlement("ws_1")).resolves.toMatchObject({ plan: { key: "free" }, overrides: { automationLimit: 7 } });
  });

  it("ranks custom plans by delivery capacity and keeps the base plan on a tie", () => {
    const custom = { ...free, key: "enterprise", name: "Enterprise", monthlyDeliveryLimit: null };
    expect(higherPlan(agency, custom).key).toBe("enterprise");
    expect(higherPlan(custom, agency).key).toBe("enterprise");
    expect(higherPlan(creator, { ...creator, name: "Creator invite" }).name).toBe("Creator");
  });
});

describe("monthly delivery reservation", () => {
  const input = { workspaceId: "ws_1", periodStart: "2026-10-01", deliveryKey: "delivery_1", limit: 2 };

  function reservationClient(options: { reservedBefore?: number; existingReservation?: boolean; failures?: unknown[] }) {
    let reserved = options.reservedBefore ?? 0;
    const failures = [...(options.failures ?? [])];
    const transaction = {
      workspaceUsagePeriod: {
        upsert: vi.fn(async () => {
          const failure = failures.shift();
          if (failure) throw failure;
        }),
        updateMany: vi.fn(async ({ where }: { where: { deliveriesReserved?: { lt: number } } }) => {
          if (where.deliveriesReserved && reserved >= where.deliveriesReserved.lt) return { count: 0 };
          reserved += 1;
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => ({ deliveriesReserved: reserved })),
      },
      workspaceUsageReservation: { create: vi.fn() },
    };
    const client = {
      $transaction: vi.fn((operation: (tx: typeof transaction) => unknown) => operation(transaction)),
      workspaceUsagePeriod: { findUnique: vi.fn(async () => ({ deliveriesReserved: reserved })) },
      workspaceUsageReservation: { findUnique: vi.fn(async () => (options.existingReservation ? { deliveryKey: "delivery_1" } : null)) },
    };
    return { client, transaction, reserved: () => reserved };
  }

  it("increments with a guard so the limit is never exceeded", async () => {
    const { client, reserved } = reservationClient({ reservedBefore: 2 });
    const repository = createPrismaEntitlementRepository(client as never);
    await expect(repository.reserveMonthlyDelivery(input)).resolves.toEqual({ reserved: false, used: 2, limit: 2 });
    expect(reserved()).toBe(2);
  });

  it("retries when it loses the race to create the month's usage row instead of counting it as reserved", async () => {
    const duplicatePeriod = Object.assign(new Error("unique conflict"), { code: "P2002" });
    const { client, reserved } = reservationClient({ failures: [duplicatePeriod] });
    const repository = createPrismaEntitlementRepository(client as never);
    await expect(repository.reserveMonthlyDelivery(input)).resolves.toEqual({ reserved: true, used: 1, limit: 2 });
    expect(client.$transaction).toHaveBeenCalledTimes(2);
    expect(reserved()).toBe(1);
  });

  it("treats a duplicate delivery key as already reserved", async () => {
    const duplicateKey = Object.assign(new Error("unique conflict"), { code: "P2002" });
    const { client } = reservationClient({ reservedBefore: 1, existingReservation: true, failures: [duplicateKey] });
    const repository = createPrismaEntitlementRepository(client as never);
    await expect(repository.reserveMonthlyDelivery(input)).resolves.toEqual({ reserved: true, used: 1, limit: 2 });
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });
});
