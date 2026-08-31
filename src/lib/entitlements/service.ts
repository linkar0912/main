import { createPrismaEntitlementRepository, type EntitlementRepository, type MonthlyReservationResult } from "./repository";
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

export function createEntitlementService(repository: EntitlementRepository, now: () => Date = () => new Date()) {
  async function getEffectiveEntitlements(workspaceId: string): Promise<EffectiveEntitlements> {
    const config = await repository.getWorkspaceEntitlement(workspaceId);
    if (!config) throw new Error("workspace_entitlement_missing");
    const parsed = EntitlementOverridesSchema.safeParse(config.overrides);
    if (!parsed.success) throw new Error("invalid_entitlement_overrides");
    const { key, name, ...defaults } = config.plan;
    return { planKey: key, planName: name, ...defaults, ...parsed.data };
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

  return { getEffectiveEntitlements, assertEntitled, reserveMonthlyDelivery };
}

let productionService: ReturnType<typeof createEntitlementService> | undefined;

export function getEntitlementService() {
  productionService ??= createEntitlementService(createPrismaEntitlementRepository());
  return productionService;
}
