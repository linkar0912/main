import { createPrismaEntitlementRepository, type EntitlementRepository, type MonthlyReservationResult } from "./repository";
import { createMemoryEntitlementRepository } from "./memory-repository";
import { getServerEnv } from "@/src/lib/env";
import {
  EntitlementOverridesSchema,
  type EffectiveEntitlements,
  type EntitlementCapability,
} from "./types";

export class EntitlementError extends Error {
  constructor(
    public readonly code: "entitlement_required" | "limit_reached",
    public readonly capability: EntitlementCapability | "deliveries",
    public readonly used?: number,
    public readonly limit?: number,
  ) {
    super(code);
    this.name = "EntitlementError";
  }
}

const capabilityRules: Record<EntitlementCapability, {
  feature?: keyof Pick<EffectiveEntitlements,
    "sequencesEnabled" | "broadcastsEnabled" | "trackedLinksEnabled" | "teamEnabled" | "facebookEnabled" | "exportsEnabled">;
  limit?: keyof Pick<EffectiveEntitlements,
    "memberLimit" | "automationLimit" | "instagramConnectionLimit" | "facebookConnectionLimit" | "sequenceLimit" | "monthlyBroadcastLimit">;
}> = {
  members: { feature: "teamEnabled", limit: "memberLimit" },
  automations: { limit: "automationLimit" },
  instagram: { limit: "instagramConnectionLimit" },
  facebook: { feature: "facebookEnabled", limit: "facebookConnectionLimit" },
  sequences: { feature: "sequencesEnabled", limit: "sequenceLimit" },
  broadcasts: { feature: "broadcastsEnabled", limit: "monthlyBroadcastLimit" },
  tracked_links: { feature: "trackedLinksEnabled" },
  exports: { feature: "exportsEnabled" },
};

function currentPeriodStart(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function createEntitlementService(
  repository: EntitlementRepository,
  now: () => Date = () => new Date(),
  cacheTtlMs = 30_000,
) {
  const entitlementCache = new Map<string, { expiresAt: number; value: EffectiveEntitlements }>();
  // Lookups already on their way to the database. A caller arriving meanwhile
  // (the worker warms this while an event's other reads run) shares the same
  // answer instead of paying for a second one.
  const inFlight = new Map<string, Promise<EffectiveEntitlements>>();
  // Bumped by invalidateWorkspace so a read that was already out when the
  // plan changed never caches its (possibly old) answer.
  const generations = new Map<string, number>();

  async function getEffectiveEntitlements(workspaceId: string): Promise<EffectiveEntitlements> {
    const cached = entitlementCache.get(workspaceId);
    const timestamp = now().getTime();
    if (cached && cached.expiresAt > timestamp) return cached.value;

    const pending = inFlight.get(workspaceId);
    if (pending) return pending;
    const lookup = loadEffectiveEntitlements(workspaceId, timestamp, generations.get(workspaceId) ?? 0);
    inFlight.set(workspaceId, lookup);
    try {
      return await lookup;
    } finally {
      if (inFlight.get(workspaceId) === lookup) inFlight.delete(workspaceId);
    }
  }

  async function loadEffectiveEntitlements(
    workspaceId: string,
    timestamp: number,
    generation: number,
  ): Promise<EffectiveEntitlements> {
    const config = await repository.getWorkspaceEntitlement(workspaceId);
    if (!config) throw new Error("workspace_entitlement_missing");
    const parsed = EntitlementOverridesSchema.safeParse(config.overrides);
    if (!parsed.success) throw new Error("invalid_entitlement_overrides");
    const { key, name, ...defaults } = config.plan;
    const value = { planKey: key, planName: name, ...defaults, ...parsed.data };
    if ((generations.get(workspaceId) ?? 0) === generation) {
      entitlementCache.set(workspaceId, { expiresAt: timestamp + cacheTtlMs, value });
    }
    return value;
  }

  async function getMonthlyDeliveryLimit(workspaceId: string): Promise<number | null> {
    return (await getEffectiveEntitlements(workspaceId)).monthlyDeliveryLimit;
  }

  async function assertEntitled(
    workspaceId: string,
    capability: EntitlementCapability,
    currentUsage: number,
  ): Promise<void> {
    const entitlements = await getEffectiveEntitlements(workspaceId);
    const rule = capabilityRules[capability];
    if (rule.feature && !entitlements[rule.feature]) {
      throw new EntitlementError("entitlement_required", capability);
    }
    const limit = rule.limit ? entitlements[rule.limit] : null;
    if (typeof limit === "number" && currentUsage >= limit) {
      throw new EntitlementError("limit_reached", capability, currentUsage, limit);
    }
  }

  async function reserveMonthlyDelivery(workspaceId: string, deliveryKey: string): Promise<MonthlyReservationResult> {
    const entitlements = await getEffectiveEntitlements(workspaceId);
    return repository.reserveMonthlyDelivery({
      workspaceId,
      deliveryKey,
      periodStart: currentPeriodStart(now()),
      limit: entitlements.monthlyDeliveryLimit,
    });
  }

  async function releaseMonthlyDelivery(deliveryKey: string): Promise<boolean> {
    return repository.releaseMonthlyDelivery(deliveryKey);
  }

  /**
   * Clears this process's cache only. Other web instances and the worker keep
   * their entry for at most cacheTtlMs (30 seconds by default), which bounds
   * how long a plan change takes to apply everywhere.
   */
  function invalidateWorkspace(workspaceId: string): void {
    entitlementCache.delete(workspaceId);
    inFlight.delete(workspaceId);
    generations.set(workspaceId, (generations.get(workspaceId) ?? 0) + 1);
  }

  return {
    getEffectiveEntitlements,
    getMonthlyDeliveryLimit,
    assertEntitled,
    reserveMonthlyDelivery,
    releaseMonthlyDelivery,
    invalidateWorkspace,
  };
}

let productionService: ReturnType<typeof createEntitlementService> | undefined;

export function getEntitlementService() {
  productionService ??= createEntitlementService(
    getServerEnv().databaseUrl
      ? createPrismaEntitlementRepository()
      : createMemoryEntitlementRepository({
        plan: {
          memberLimit: null,
          automationLimit: null,
          instagramConnectionLimit: null,
          facebookConnectionLimit: null,
          sequenceLimit: null,
          monthlyBroadcastLimit: null,
          monthlyDeliveryLimit: null,
          sequencesEnabled: true,
          broadcastsEnabled: true,
          trackedLinksEnabled: true,
          teamEnabled: true,
          facebookEnabled: true,
          exportsEnabled: true,
        },
      }),
  );
  return productionService;
}
