import "server-only";

import { AdminAuditPhase, Prisma, type PrismaClient } from "@prisma/client";

import { getEntitlementService } from "@/src/lib/entitlements/service";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import { BILLING_PLANS } from "./catalog";
import { PAID_ACCESS_STATUSES } from "./subscription-status";

const FREE_PLAN_ID = "plan_free";
const BILLING_PLAN_IDS = new Set(Object.keys(BILLING_PLANS).map((key) => `plan_${key}`));
const SWEEP_BATCH_SIZE = 100;

type SweepClient = Pick<PrismaClient, "$transaction" | "billingSubscription">;

export type BillingExpirySweepResult = { examined: number; downgraded: number; conflicts: number };

/**
 * Webhooks keep the paid plan for a lapsed subscription (cancelled, halted,
 * paused, pending, completed, expired) until currentPeriodEnd, but Razorpay
 * sends nothing when that moment passes. This sweep downgrades those
 * workspaces to Free. It is idempotent: a downgraded workspace no longer
 * holds a billing plan, so a re-run skips it.
 *
 * Only a catalog plan last written at or before the period end is revoked, so
 * an admin who assigns a plan after the subscription lapsed (or a custom plan)
 * is left alone. A webhook that re-activates the subscription regrants it.
 */
export async function sweepLapsedBillingEntitlements(dependencies: {
  client?: SweepClient;
  now?: Date;
  invalidate?: (workspaceId: string) => void;
  batchSize?: number;
} = {}): Promise<BillingExpirySweepResult> {
  const client = dependencies.client ?? prisma;
  const now = dependencies.now ?? new Date();
  const invalidate = dependencies.invalidate ?? ((workspaceId: string) => getEntitlementService().invalidateWorkspace(workspaceId));
  const batchSize = dependencies.batchSize ?? SWEEP_BATCH_SIZE;
  const result: BillingExpirySweepResult = { examined: 0, downgraded: 0, conflicts: 0 };
  let cursor: string | undefined;

  for (;;) {
    const candidates = await client.billingSubscription.findMany({
      // Keyset pagination (id > last) rather than Prisma's cursor+skip: rows
      // downgraded in the previous page no longer match the filter.
      where: {
        ...(cursor ? { id: { gt: cursor } } : {}),
        status: { notIn: [...PAID_ACCESS_STATUSES] },
        currentPeriodEnd: { lte: now },
        workspace: { entitlement: { is: { planId: { not: FREE_PLAN_ID } } } },
      },
      select: { id: true },
      orderBy: { id: "asc" },
      take: batchSize,
    });
    for (const candidate of candidates) {
      result.examined += 1;
      try {
        const workspaceId = await client.$transaction(
          (transaction) => downgradeLapsedSubscription(transaction, candidate.id, now),
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (workspaceId) {
          result.downgraded += 1;
          invalidate(workspaceId);
        }
      } catch (error) {
        // A concurrent webhook won; the next run re-evaluates this row.
        if ((error as { code?: string }).code !== "P2034") throw error;
        result.conflicts += 1;
      }
    }
    if (candidates.length < batchSize) return result;
    cursor = candidates[candidates.length - 1].id;
  }
}

async function downgradeLapsedSubscription(
  transaction: Prisma.TransactionClient,
  subscriptionId: string,
  now: Date,
): Promise<string | null> {
  const subscription = await transaction.billingSubscription.findUnique({
    where: { id: subscriptionId },
    select: { workspaceId: true, providerSubscriptionId: true, status: true, currentPeriodEnd: true },
  });
  if (!subscription?.currentPeriodEnd || subscription.currentPeriodEnd > now) return null;
  if (PAID_ACCESS_STATUSES.includes(subscription.status)) return null;
  const entitlement = await transaction.workspaceEntitlement.findUnique({
    where: { workspaceId: subscription.workspaceId },
    select: { planId: true, updatedAt: true },
  });
  if (!entitlement || !BILLING_PLAN_IDS.has(entitlement.planId)) return null;
  if (entitlement.updatedAt > subscription.currentPeriodEnd) return null;
  await transaction.workspaceEntitlement.update({
    where: { workspaceId: subscription.workspaceId },
    data: { planId: FREE_PLAN_ID, version: { increment: 1 } },
  });
  await transaction.adminAuditEvent.create({
    data: {
      id: createId("audit"), requestId: `billing-sweep:${subscriptionId}:${now.getTime()}`, phase: AdminAuditPhase.SUCCESS,
      actorUserId: "billing-sweep", actorEmail: "system@linkar.in", sessionId: "billing-sweep",
      action: "billing.subscription.lapse", targetType: "billing_subscription",
      targetId: subscription.providerSubscriptionId ?? subscriptionId, workspaceId: subscription.workspaceId,
      reason: `Paid-through period ended (${subscription.status.toLowerCase()})`,
      before: { planId: entitlement.planId }, after: { planId: FREE_PLAN_ID, status: subscription.status },
      ipHash: "system", userAgent: "Linkar worker",
    },
  });
  return subscription.workspaceId;
}
