import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { createMemoryEntitlementRepository } from "./memory-repository";
import { createEntitlementService, EntitlementError } from "./service";

describe("EntitlementService", () => {
  it("resolves strict workspace overrides over plan defaults", async () => {
    const repository = createMemoryEntitlementRepository({
      plan: {
        key: "free",
        name: "Free",
        memberLimit: 2,
        automationLimit: 3,
        instagramConnectionLimit: 1,
        facebookConnectionLimit: 0,
        sequenceLimit: 0,
        monthlyBroadcastLimit: 0,
        monthlyDeliveryLimit: 100,
        sequencesEnabled: false,
        broadcastsEnabled: false,
        trackedLinksEnabled: false,
        teamEnabled: false,
        facebookEnabled: false,
        exportsEnabled: false,
      },
      overrides: { automationLimit: 10, broadcastsEnabled: true },
    });
    const service = createEntitlementService(repository);

    await expect(service.getEffectiveEntitlements("w1")).resolves.toMatchObject({
      planKey: "free",
      automationLimit: 10,
      monthlyDeliveryLimit: 100,
      broadcastsEnabled: true,
    });
  });

  it("rejects unknown override keys instead of silently widening access", async () => {
    const repository = createMemoryEntitlementRepository({ overrides: { secretFeature: true } as never });

    await expect(createEntitlementService(repository).getEffectiveEntitlements("w1"))
      .rejects.toThrow("invalid_entitlement_overrides");
  });

  it("allows only atomic, idempotent reservations within the monthly limit", async () => {
    const repository = createMemoryEntitlementRepository({
      plan: { monthlyDeliveryLimit: 2 },
    });
    const service = createEntitlementService(repository, () => new Date("2026-08-31T10:00:00.000Z"));

    const results = await Promise.all(["d1", "d2", "d3"].map((key) => service.reserveMonthlyDelivery("w1", key)));
    expect(results.filter((result) => result.reserved)).toHaveLength(2);
    await expect(service.reserveMonthlyDelivery("w1", "d1")).resolves.toEqual({ reserved: true, used: 2, limit: 2 });
  });

  it("returns explicit feature and numeric limit errors", async () => {
    const service = createEntitlementService(createMemoryEntitlementRepository({
      plan: { broadcastsEnabled: false, automationLimit: 3 },
    }));

    await expect(service.assertEntitled("w1", "broadcasts", 0)).rejects.toEqual(
      new EntitlementError("entitlement_required", "broadcasts"),
    );
    await expect(service.assertEntitled("w1", "automations", 3)).rejects.toEqual(
      new EntitlementError("limit_reached", "automations", 3, 3),
    );
  });

  it("caches entitlement configuration for 30 seconds without caching usage", async () => {
    const repository = createMemoryEntitlementRepository({
      plan: { monthlyDeliveryLimit: 25 },
    });
    const entitlementRead = vi.spyOn(repository, "getWorkspaceEntitlement");
    let timestamp = Date.parse("2026-08-31T10:00:00.000Z");
    const service = createEntitlementService(repository, () => new Date(timestamp), 30_000);

    await expect(service.getMonthlyDeliveryLimit("w1")).resolves.toBe(25);
    await expect(service.getMonthlyDeliveryLimit("w1")).resolves.toBe(25);
    expect(entitlementRead).toHaveBeenCalledOnce();

    timestamp += 30_001;
    await expect(service.getMonthlyDeliveryLimit("w1")).resolves.toBe(25);
    expect(entitlementRead).toHaveBeenCalledTimes(2);

    await service.reserveMonthlyDelivery("w1", "delivery_1");
    await service.reserveMonthlyDelivery("w1", "delivery_2");
    expect(entitlementRead).toHaveBeenCalledTimes(2);
  });
});
