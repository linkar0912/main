import "server-only";

import { BillingCheckoutState, BillingInterval, BillingSubscriptionStatus, Prisma, type PrismaClient } from "@prisma/client";

import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";

export type CheckoutClaim =
  | { kind: "create"; attemptId: string }
  | { kind: "reuse"; attemptId: string; subscriptionId: string }
  | { kind: "processing"; attemptId: string }
  | { kind: "conflict"; attemptId: string };

export type OwnerSubscription = {
  id: string;
  providerSubscriptionId: string;
  status: BillingSubscriptionStatus;
};

export interface BillingRepository {
  getBillingView(workspaceId: string, periodStart: Date): Promise<{
    subscription: unknown;
    deliveriesUsed: number;
    entitlementPlanKey: string;
  }>;
  claimCheckout(input: {
    workspaceId: string;
    planId: string;
    interval: BillingInterval;
    now: Date;
    expiresAt: Date;
  }): Promise<CheckoutClaim>;
  markCheckoutReady(attemptId: string, providerSubscriptionId: string): Promise<void>;
  markCheckoutFailed(attemptId: string, failureCode: string): Promise<void>;
  markCheckoutVerified(workspaceId: string, providerSubscriptionId: string, verifiedAt: Date): Promise<boolean>;
  getSubscriptionForOwnerAction(workspaceId: string): Promise<OwnerSubscription | null>;
  recordPendingPlanChange(subscriptionId: string, planId: string, interval: BillingInterval): Promise<void>;
  recordPendingCancellation(subscriptionId: string): Promise<void>;
}

type BillingPrismaClient = Pick<PrismaClient,
  "$transaction" | "billingCheckoutAttempt" | "billingSubscription" | "workspaceEntitlement" | "workspaceUsagePeriod"
>;

export function createPrismaBillingRepository(client: BillingPrismaClient = prisma): BillingRepository {
  return {
    async getBillingView(workspaceId, periodStart) {
      const [subscription, entitlement, usage] = await Promise.all([
        client.billingSubscription.findUnique({ where: { workspaceId } }),
        client.workspaceEntitlement.findUnique({
          where: { workspaceId },
          select: { plan: { select: { key: true } } },
        }),
        client.workspaceUsagePeriod.findUnique({
          where: { workspaceId_periodStart: { workspaceId, periodStart } },
          select: { deliveriesReserved: true },
        }),
      ]);
      return {
        subscription,
        deliveriesUsed: usage?.deliveriesReserved ?? 0,
        entitlementPlanKey: entitlement?.plan.key ?? "free",
      };
    },

    async claimCheckout(input) {
      return client.$transaction(async (transaction) => {
        await transaction.billingCheckoutAttempt.updateMany({
          where: {
            workspaceId: input.workspaceId,
            state: { in: [BillingCheckoutState.CREATING, BillingCheckoutState.READY] },
            expiresAt: { lte: input.now },
          },
          data: { state: BillingCheckoutState.EXPIRED },
        });
        const existing = await transaction.billingCheckoutAttempt.findFirst({
          where: {
            workspaceId: input.workspaceId,
            state: { in: [BillingCheckoutState.CREATING, BillingCheckoutState.READY] },
            expiresAt: { gt: input.now },
          },
          orderBy: { createdAt: "desc" },
        });
        if (existing && (existing.planId !== input.planId || existing.interval !== input.interval)) {
          return { kind: "conflict", attemptId: existing.id } as const;
        }
        if (existing?.state === BillingCheckoutState.READY && existing.providerSubscriptionId) {
          return { kind: "reuse", attemptId: existing.id, subscriptionId: existing.providerSubscriptionId } as const;
        }
        if (existing) return { kind: "processing", attemptId: existing.id } as const;
        const attempt = await transaction.billingCheckoutAttempt.create({
          data: {
            id: createId("checkout"),
            workspaceId: input.workspaceId,
            planId: input.planId,
            interval: input.interval,
            expiresAt: input.expiresAt,
          },
        });
        return { kind: "create", attemptId: attempt.id } as const;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    },

    async markCheckoutReady(attemptId, providerSubscriptionId) {
      await client.billingCheckoutAttempt.update({
        where: { id: attemptId },
        data: { state: BillingCheckoutState.READY, providerSubscriptionId, failureCode: null },
      });
    },

    async markCheckoutFailed(attemptId, failureCode) {
      await client.billingCheckoutAttempt.updateMany({
        where: { id: attemptId, state: BillingCheckoutState.CREATING },
        data: { state: BillingCheckoutState.FAILED, failureCode: failureCode.slice(0, 200) },
      });
    },

    async markCheckoutVerified(workspaceId, providerSubscriptionId, verifiedAt) {
      const attempt = await client.billingCheckoutAttempt.findFirst({
        where: { workspaceId, providerSubscriptionId, state: BillingCheckoutState.READY },
        select: { id: true },
      });
      if (!attempt) return false;
      await client.$transaction([
        client.billingCheckoutAttempt.update({
          where: { id: attempt.id },
          data: { state: BillingCheckoutState.VERIFIED },
        }),
        client.billingSubscription.updateMany({
          where: { workspaceId, providerSubscriptionId },
          data: { checkoutVerifiedAt: verifiedAt },
        }),
      ]);
      return true;
    },

    async getSubscriptionForOwnerAction(workspaceId) {
      const subscription = await client.billingSubscription.findUnique({
        where: { workspaceId },
        select: { id: true, providerSubscriptionId: true, status: true },
      });
      return subscription?.providerSubscriptionId
        ? { ...subscription, providerSubscriptionId: subscription.providerSubscriptionId }
        : null;
    },

    async recordPendingPlanChange(subscriptionId, planId, interval) {
      await client.billingSubscription.update({
        where: { id: subscriptionId },
        data: { pendingPlanId: planId, pendingInterval: interval },
      });
    },

    async recordPendingCancellation(subscriptionId) {
      await client.billingSubscription.update({
        where: { id: subscriptionId },
        data: { cancelAtPeriodEnd: true },
      });
    },
  };
}
