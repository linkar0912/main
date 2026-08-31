import "server-only";

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";

/** Rebuilds the cached monthly reservation counter from its idempotency ledger. */
export async function reconcileUsageReservations(client: PrismaClient = prisma): Promise<{ periodsUpdated: number }> {
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
