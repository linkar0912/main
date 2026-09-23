import "server-only";

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

/** Rebuilds the cached monthly reservation counter from its idempotency ledger. */
export async function reconcileUsageReservations(client: PrismaClient = prisma): Promise<{ periodsUpdated: number }> {
  // Reservations for deliveries that can never re-claim and confirm them
  // (FAILED / UNKNOWN) are orphans - drop them before rebuilding the counter.
  await client.$executeRaw`
    DELETE FROM "WorkspaceUsageReservation" AS reservation
    USING "OutboundDelivery" AS delivery
    WHERE reservation."deliveryKey" = delivery."deliveryKey"
      AND delivery."state" IN ('FAILED', 'UNKNOWN')
  `;
  const periodsUpdated = await client.$executeRaw`
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
}
