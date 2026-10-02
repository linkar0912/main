import "server-only";

import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

/** Rebuilds the cached monthly reservation counter from its idempotency ledger. */
export async function reconcileUsageReservations(client: PrismaClient = prisma): Promise<{ periodsUpdated: number }> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await client.$transaction(async (transaction) => {
        // Reservations for deliveries that can never re-claim and confirm them
        // (FAILED / UNKNOWN) are orphans - drop them before rebuilding the counter.
        await transaction.$executeRaw`
          DELETE FROM "WorkspaceUsageReservation" AS reservation
          USING "OutboundDelivery" AS delivery
          WHERE reservation."deliveryKey" = delivery."deliveryKey"
            AND delivery."state" IN ('FAILED', 'UNKNOWN')
        `;
        const periodsUpdated = await transaction.$executeRaw`
          UPDATE "WorkspaceUsagePeriod" AS period
          SET "deliveriesReserved" = (
            SELECT COUNT(*)::integer
            FROM "WorkspaceUsageReservation" AS reservation
            WHERE reservation."workspaceId" = period."workspaceId"
              AND reservation."periodStart" = period."periodStart"
          ),
          "updatedAt" = NOW()
          WHERE period."deliveriesReserved" <> (
            SELECT COUNT(*)::integer
            FROM "WorkspaceUsageReservation" AS reservation
            WHERE reservation."workspaceId" = period."workspaceId"
              AND reservation."periodStart" = period."periodStart"
          )
        `;
        return { periodsUpdated };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 2 && (error as { code?: string }).code === "P2034") continue;
      throw error;
    }
  }
}
