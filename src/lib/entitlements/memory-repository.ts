import type { EntitlementRepository, WorkspaceEntitlementConfig } from "./repository";
import type { EntitlementOverrides, PlanEntitlements } from "./types";

const FREE_PLAN: PlanEntitlements = {
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
};

export function createMemoryEntitlementRepository(seed: {
  plan?: Partial<PlanEntitlements>;
  overrides?: EntitlementOverrides;
} = {}): EntitlementRepository {
  const config: WorkspaceEntitlementConfig = {
    plan: { ...FREE_PLAN, ...seed.plan },
    overrides: seed.overrides ?? {},
  };
  const reservations = new Set<string>();
  const usage = new Map<string, number>();

  return {
    async getWorkspaceEntitlement() {
      return structuredClone(config);
    },
    async reserveMonthlyDelivery(input) {
      const usageKey = `${input.workspaceId}:${input.periodStart}`;
      const used = usage.get(usageKey) ?? 0;
      if (reservations.has(input.deliveryKey)) return { reserved: true, used, limit: input.limit };
      if (input.limit !== null && used >= input.limit) return { reserved: false, used, limit: input.limit };
      reservations.add(input.deliveryKey);
      usage.set(usageKey, used + 1);
      return { reserved: true, used: used + 1, limit: input.limit };
    },
  };
}
