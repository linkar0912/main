import { Prisma } from "@prisma/client";

import { prisma } from "@/src/lib/prisma";
import type { EntitlementOverrides, PlanEntitlements } from "./types";

export type WorkspaceEntitlementConfig = {
  plan: PlanEntitlements;
  overrides: unknown;
};

export type MonthlyReservationResult = { reserved: boolean; used: number; limit: number | null };

export interface EntitlementRepository {
  getWorkspaceEntitlement(workspaceId: string): Promise<WorkspaceEntitlementConfig | null>;
  reserveMonthlyDelivery(input: {
    workspaceId: string;
    periodStart: string;
    deliveryKey: string;
    limit: number | null;
  }): Promise<MonthlyReservationResult>;
  releaseMonthlyDelivery(deliveryKey: string): Promise<boolean>;
}

function mapPlan(plan: {
  key: string;
  name: string;
  memberLimit: number | null;
  automationLimit: number | null;
  instagramConnectionLimit: number | null;
  facebookConnectionLimit: number | null;
  sequenceLimit: number | null;
  monthlyBroadcastLimit: number | null;
  monthlyDeliveryLimit: number | null;
  sequencesEnabled: boolean;
  broadcastsEnabled: boolean;
  trackedLinksEnabled: boolean;
  teamEnabled: boolean;
  facebookEnabled: boolean;
  exportsEnabled: boolean;
}): PlanEntitlements {
  return plan;
}

// Launch catalog order. A plan outside it (an admin-defined custom plan) is
// compared by monthly delivery capacity, with null meaning unlimited.
const PLAN_RANK: Record<string, number> = { free: 0, creator: 1, growth: 2, agency: 3 };

function planCapacity(plan: PlanEntitlements): number {
  return plan.monthlyDeliveryLimit ?? Number.POSITIVE_INFINITY;
}

/** The higher of the paid/base plan and an invite plan; ties keep the base plan. */
export function higherPlan(base: PlanEntitlements, premium: PlanEntitlements): PlanEntitlements {
  const baseRank = PLAN_RANK[base.key];
  const premiumRank = PLAN_RANK[premium.key];
  if (baseRank !== undefined && premiumRank !== undefined) return premiumRank > baseRank ? premium : base;
  return planCapacity(premium) > planCapacity(base) ? premium : base;
}

class MonthlyLimitReached extends Error {}

export function createPrismaEntitlementRepository(client = prisma, now: () => Date = () => new Date()): EntitlementRepository {
  return {
    async getWorkspaceEntitlement(workspaceId) {
      const timestamp = now();
      const [entitlement, premium] = await Promise.all([
        client.workspaceEntitlement.findUnique({
          where: { workspaceId },
          select: { overrides: true, plan: true },
        }),
        client.premiumInviteRedemption.findFirst({
          where: { workspaceId, startsAt: { lte: timestamp }, expiresAt: { gt: timestamp } },
          orderBy: { expiresAt: "desc" },
          select: { plan: true },
        }),
      ]);
      // An invite never downgrades a paid plan and never drops the workspace's
      // admin overrides; it only lifts the base plan while it is active.
      if (!entitlement) return premium ? { plan: mapPlan(premium.plan), overrides: {} } : null;
      const base = mapPlan(entitlement.plan);
      return { plan: premium ? higherPlan(base, mapPlan(premium.plan)) : base, overrides: entitlement.overrides };
    },

    async reserveMonthlyDelivery(input) {
      const periodStart = new Date(`${input.periodStart}T00:00:00.000Z`);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          return await client.$transaction(async (transaction) => {
            await transaction.workspaceUsagePeriod.upsert({
              where: { workspaceId_periodStart: { workspaceId: input.workspaceId, periodStart } },
              create: { workspaceId: input.workspaceId, periodStart },
              update: {},
            });
            await transaction.workspaceUsageReservation.create({
              data: { deliveryKey: input.deliveryKey, workspaceId: input.workspaceId, periodStart },
            });
            const updated = await transaction.workspaceUsagePeriod.updateMany({
              where: {
                workspaceId: input.workspaceId,
                periodStart,
                ...(input.limit === null ? {} : { deliveriesReserved: { lt: input.limit } }),
              },
              data: { deliveriesReserved: { increment: 1 } },
            });
            if (updated.count !== 1) throw new MonthlyLimitReached();
            const usage = await transaction.workspaceUsagePeriod.findUniqueOrThrow({
              where: { workspaceId_periodStart: { workspaceId: input.workspaceId, periodStart } },
              select: { deliveriesReserved: true },
            });
            return { reserved: true, used: usage.deliveriesReserved, limit: input.limit };
          }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code === "P2034" && attempt < 3) continue;
          const usage = await client.workspaceUsagePeriod.findUnique({
            where: { workspaceId_periodStart: { workspaceId: input.workspaceId, periodStart } },
            select: { deliveriesReserved: true },
          });
          if (error instanceof MonthlyLimitReached) {
            return { reserved: false, used: usage?.deliveriesReserved ?? 0, limit: input.limit };
          }
          if (code === "P2002") {
            // Only a duplicate deliveryKey means "already reserved"; losing the
            // race to create this month's period row is retried, not counted.
            const reservation = await client.workspaceUsageReservation.findUnique({
              where: { deliveryKey: input.deliveryKey },
              select: { deliveryKey: true },
            });
            if (reservation) return { reserved: true, used: usage?.deliveriesReserved ?? 0, limit: input.limit };
            if (attempt < 3) continue;
          }
          throw error;
        }
      }
      throw new Error("monthly_reservation_retry_exhausted");
    },

    async releaseMonthlyDelivery(deliveryKey) {
      return client.$transaction(async (transaction) => {
        const reservation = await transaction.workspaceUsageReservation.findUnique({ where: { deliveryKey } });
        if (!reservation) return false;
        await transaction.workspaceUsageReservation.delete({ where: { deliveryKey } });
        await transaction.workspaceUsagePeriod.updateMany({
          where: {
            workspaceId: reservation.workspaceId,
            periodStart: reservation.periodStart,
            deliveriesReserved: { gt: 0 },
          },
          data: { deliveriesReserved: { decrement: 1 } },
        });
        return true;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    },
  };
}

export type { EntitlementOverrides };
