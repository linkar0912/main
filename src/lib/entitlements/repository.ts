import "server-only";

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

class MonthlyLimitReached extends Error {}

export function createPrismaEntitlementRepository(client = prisma): EntitlementRepository {
  return {
    async getWorkspaceEntitlement(workspaceId) {
      const entitlement = await client.workspaceEntitlement.findUnique({
        where: { workspaceId },
        select: { overrides: true, plan: true },
      });
      return entitlement ? { plan: mapPlan(entitlement.plan), overrides: entitlement.overrides } : null;
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
            return { reserved: true, used: usage?.deliveriesReserved ?? 0, limit: input.limit };
          }
          throw error;
        }
      }
      throw new Error("monthly_reservation_retry_exhausted");
    },
  };
}

export type { EntitlementOverrides };
