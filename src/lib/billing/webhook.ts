import "server-only";

import { createHash } from "node:crypto";
import { AdminAuditPhase, BillingSubscriptionStatus, BillingWebhookState, Prisma, type PrismaClient } from "@prisma/client";

import { getServerEnv, type ServerEnv } from "@/src/lib/env";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import { resolveLinkarPlanFromRazorpayId } from "./catalog";
import { verifyWebhookSignature } from "./signatures";
import { isLiveSubscriptionStatus, LAPSED_STATUSES, subscriptionStatusPrecedence } from "./subscription-status";
import type { BillingInterval } from "./types";

const RELEVANT_EVENTS = new Set([
  "subscription.authenticated",
  "subscription.activated",
  "subscription.charged",
  "subscription.pending",
  "subscription.halted",
  "subscription.paused",
  "subscription.resumed",
  "subscription.cancelled",
  "subscription.completed",
  "subscription.expired",
  "subscription.updated",
]);

export type NormalizedRazorpayEvent = {
  eventType: string;
  subscriptionId: string;
  providerPlanId: string;
  /** Null when the Razorpay plan id is not one of the configured plans. */
  linkarPlanId: string | null;
  interval: BillingInterval | null;
  providerStatus: string;
  status: BillingSubscriptionStatus;
  providerCreatedAt: Date;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  customerId?: string;
  workspaceId?: string;
  attemptId?: string;
};

export class WebhookError extends Error {
  constructor(public readonly code: "billing_not_configured" | "invalid_webhook_signature" | "invalid_webhook_payload") {
    super(code);
    this.name = "WebhookError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 500) throw new WebhookError("invalid_webhook_payload");
  return value;
}

function unixDate(value: unknown, required = false): Date | undefined {
  if (value === null || value === undefined) {
    if (required) throw new WebhookError("invalid_webhook_payload");
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new WebhookError("invalid_webhook_payload");
  return new Date(value * 1_000);
}

function normalizedStatus(eventType: string, providerStatus: string): BillingSubscriptionStatus {
  const suffix = eventType.slice("subscription.".length);
  const mapping: Record<string, BillingSubscriptionStatus> = {
    authenticated: BillingSubscriptionStatus.AUTHENTICATED,
    activated: BillingSubscriptionStatus.ACTIVE,
    charged: BillingSubscriptionStatus.ACTIVE,
    pending: BillingSubscriptionStatus.PENDING,
    halted: BillingSubscriptionStatus.HALTED,
    paused: BillingSubscriptionStatus.PAUSED,
    resumed: BillingSubscriptionStatus.ACTIVE,
    cancelled: BillingSubscriptionStatus.CANCELLED,
    completed: BillingSubscriptionStatus.COMPLETED,
    expired: BillingSubscriptionStatus.EXPIRED,
  };
  const providerMapping: Record<string, BillingSubscriptionStatus> = {
    created: BillingSubscriptionStatus.CREATED,
    authenticated: BillingSubscriptionStatus.AUTHENTICATED,
    active: BillingSubscriptionStatus.ACTIVE,
    pending: BillingSubscriptionStatus.PENDING,
    halted: BillingSubscriptionStatus.HALTED,
    paused: BillingSubscriptionStatus.PAUSED,
    cancelled: BillingSubscriptionStatus.CANCELLED,
    completed: BillingSubscriptionStatus.COMPLETED,
    expired: BillingSubscriptionStatus.EXPIRED,
  };
  const status = suffix === "updated" ? providerMapping[providerStatus] : mapping[suffix];
  if (!status) throw new WebhookError("invalid_webhook_payload");
  return status;
}

export function normalizeRazorpaySubscriptionEvent(
  value: unknown,
  env: Pick<ServerEnv, "razorpay">,
): NormalizedRazorpayEvent | null {
  const root = record(value);
  const eventType = root && typeof root.event === "string" ? root.event : "";
  if (!RELEVANT_EVENTS.has(eventType)) return null;
  const payload = record(root?.payload);
  const subscription = record(payload?.subscription);
  const entity = record(subscription?.entity);
  if (!entity) throw new WebhookError("invalid_webhook_payload");
  const providerPlanId = requiredString(entity.plan_id);
  // An unknown plan id (rotated env, dashboard-created plan) is not a malformed
  // payload: a 400 would make Razorpay retry and eventually disable the
  // endpoint. The repository falls back to the stored plan or ignores it.
  const trustedPlan = resolveLinkarPlanFromRazorpayId(providerPlanId, env);
  const notes = record(entity.notes);
  const providerStatus = requiredString(entity.status);
  return {
    eventType,
    subscriptionId: requiredString(entity.id),
    providerPlanId,
    linkarPlanId: trustedPlan?.planId ?? null,
    interval: trustedPlan?.interval ?? null,
    providerStatus,
    status: normalizedStatus(eventType, providerStatus),
    providerCreatedAt: unixDate(root?.created_at, true)!,
    currentPeriodStart: unixDate(entity.current_start),
    currentPeriodEnd: unixDate(entity.current_end),
    customerId: typeof entity.customer_id === "string" ? entity.customer_id : undefined,
    workspaceId: typeof notes?.workspace_id === "string" ? notes.workspace_id : undefined,
    attemptId: typeof notes?.attempt_id === "string" ? notes.attempt_id : undefined,
  };
}

const GRANT_EVENTS = new Set(["subscription.activated", "subscription.charged", "subscription.resumed"]);

/**
 * Lapsed statuses (pending/halted/paused/cancelled/completed/expired, whether
 * from their own event or a subscription.updated) keep the current plan only
 * while the paid period runs; sweepLapsedBillingEntitlements downgrades them
 * once currentPeriodEnd passes, since no further webhook may arrive.
 */
export function entitlementPlanForEvent(
  event: Pick<NormalizedRazorpayEvent, "eventType" | "status" | "currentPeriodEnd"> & { linkarPlanId: string },
  currentPlanId: string,
  now: Date,
): string {
  if (GRANT_EVENTS.has(event.eventType)) return event.linkarPlanId;
  if (LAPSED_STATUSES.has(event.status)) {
    return event.currentPeriodEnd && event.currentPeriodEnd > now ? currentPlanId : "plan_free";
  }
  return currentPlanId;
}

export interface BillingWebhookRepository {
  applyEvent(input: NormalizedRazorpayEvent & { eventId: string; payloadHash: string; now: Date }): Promise<{
    outcome: "applied" | "duplicate" | "stale" | "ignored";
    workspaceId?: string;
  }>;
}

type WebhookPrismaClient = Pick<PrismaClient, "$transaction">;

/**
 * Razorpay's created_at has one-second resolution and event ids are random, so
 * a same-second tie is ordered by lifecycle precedence instead (activated and
 * charged commonly share a second). Equal precedence applies: replaying the
 * same state is harmless, while dropping it could lose a paid activation.
 */
export function isStaleProviderEvent(
  lastAt: Date | null,
  lastStatus: BillingSubscriptionStatus | null,
  nextAt: Date,
  nextStatus: BillingSubscriptionStatus,
): boolean {
  if (!lastAt) return false;
  const timeDifference = nextAt.getTime() - lastAt.getTime();
  if (timeDifference !== 0) return timeDifference < 0;
  return lastStatus !== null && subscriptionStatusPrecedence(nextStatus) < subscriptionStatusPrecedence(lastStatus);
}

const APPLY_EVENT_ATTEMPTS = 4;

export function createPrismaBillingWebhookRepository(client: WebhookPrismaClient = prisma): BillingWebhookRepository {
  type ApplyInput = Parameters<BillingWebhookRepository["applyEvent"]>[0];

  async function applyInTransaction(transaction: Prisma.TransactionClient, input: ApplyInput) {
    const replayed = await transaction.billingWebhookEvent.findFirst({
      where: { payloadHash: input.payloadHash },
      select: { id: true },
    });
    if (replayed) return { outcome: "duplicate" as const };
    let receipt: { id: string };
    try {
      receipt = await transaction.billingWebhookEvent.create({
        data: {
          id: createId("billing_event"), eventId: input.eventId, eventType: input.eventType,
          entityId: input.subscriptionId, providerCreatedAt: input.providerCreatedAt,
          payloadHash: input.payloadHash,
        },
        select: { id: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return { outcome: "duplicate" as const };
      throw error;
    }
    const ignore = async (outcome: "ignored" | "stale", workspaceId?: string) => {
      await transaction.billingWebhookEvent.update({
        where: { id: receipt.id }, data: { workspaceId, state: BillingWebhookState.IGNORED, processedAt: input.now },
      });
      return outcome === "stale" ? { outcome, workspaceId } : { outcome };
    };
    const current = await transaction.billingSubscription.findUnique({
      where: { providerSubscriptionId: input.subscriptionId },
    });
    const attempt = current ? null : await transaction.billingCheckoutAttempt.findFirst({
      where: {
        ...(input.attemptId ? { id: input.attemptId } : { providerSubscriptionId: input.subscriptionId }),
      },
    });
    const workspaceId = current?.workspaceId ?? attempt?.workspaceId;
    // A known subscription keeps its stored plan when Razorpay reports a plan id
    // we no longer map; an unknown subscription with an unknown plan is ignored.
    const planId = input.linkarPlanId ?? current?.planId ?? null;
    const interval = input.interval ?? current?.interval ?? null;
    if (!workspaceId || !planId || !interval
      || (input.workspaceId && input.workspaceId !== workspaceId) || (attempt && attempt.planId !== planId)) {
      return ignore("ignored");
    }
    if (current && isStaleProviderEvent(current.lastProviderEventAt, current.status, input.providerCreatedAt, input.status)) {
      return ignore("stale", workspaceId);
    }
    if (!current) {
      // The workspace row is upserted by workspaceId, so an event for a different
      // subscription would overwrite it. Only a live, not-older subscription may
      // replace a terminal one; anything else (e.g. a late cancel of an old
      // subscription) must not touch a paying workspace.
      const occupant = await transaction.billingSubscription.findUnique({
        where: { workspaceId },
        select: { providerSubscriptionId: true, status: true, lastProviderEventAt: true },
      });
      if (occupant?.providerSubscriptionId && occupant.providerSubscriptionId !== input.subscriptionId && (
        isLiveSubscriptionStatus(occupant.status)
        || !isLiveSubscriptionStatus(input.status)
        || (occupant.lastProviderEventAt && input.providerCreatedAt < occupant.lastProviderEventAt)
      )) {
        return ignore("ignored", workspaceId);
      }
    }
    const providerPlanId = input.linkarPlanId ? input.providerPlanId : current?.providerPlanId ?? input.providerPlanId;
    const entitlement = await transaction.workspaceEntitlement.findUnique({ where: { workspaceId } });
    const currentPlanId = entitlement?.planId ?? "plan_free";
    const nextPlanId = entitlementPlanForEvent({ ...input, linkarPlanId: planId }, currentPlanId, input.now);
    await transaction.billingSubscription.upsert({
      where: { workspaceId },
      create: {
        id: createId("billing"), workspaceId, planId, interval,
        providerSubscriptionId: input.subscriptionId, providerCustomerId: input.customerId,
        providerPlanId, status: input.status, providerStatus: input.providerStatus,
        currentPeriodStart: input.currentPeriodStart, currentPeriodEnd: input.currentPeriodEnd,
        lastProviderEventAt: input.providerCreatedAt, lastProviderEventId: input.eventId,
      },
      update: {
        planId, interval, providerSubscriptionId: input.subscriptionId,
        providerCustomerId: input.customerId, providerPlanId,
        status: input.status, providerStatus: input.providerStatus,
        currentPeriodStart: input.currentPeriodStart, currentPeriodEnd: input.currentPeriodEnd,
        cancelAtPeriodEnd: input.status === BillingSubscriptionStatus.CANCELLED,
        pendingPlanId: GRANT_EVENTS.has(input.eventType) ? null : undefined,
        pendingInterval: GRANT_EVENTS.has(input.eventType) ? null : undefined,
        lastProviderEventAt: input.providerCreatedAt, lastProviderEventId: input.eventId,
      },
    });
    if (entitlement) {
      await transaction.workspaceEntitlement.update({
        where: { workspaceId }, data: { planId: nextPlanId, version: { increment: 1 } },
      });
    } else {
      await transaction.workspaceEntitlement.create({ data: { workspaceId, planId: nextPlanId } });
    }
    await transaction.billingWebhookEvent.update({
      where: { id: receipt.id },
      data: { workspaceId, state: BillingWebhookState.PROCESSED, processedAt: input.now },
    });
    await transaction.adminAuditEvent.create({
      data: {
        id: createId("audit"), requestId: `razorpay:${input.eventId}`, phase: AdminAuditPhase.SUCCESS,
        actorUserId: "razorpay", actorEmail: "system@linkar.in", sessionId: input.eventId,
        action: "billing.webhook.apply", targetType: "billing_subscription", targetId: input.subscriptionId,
        workspaceId, reason: input.eventType, before: { planId: currentPlanId },
        after: { planId: nextPlanId, status: input.status }, ipHash: "provider", userAgent: "Razorpay webhook",
      },
    });
    return { outcome: "applied" as const, workspaceId };
  }

  return {
    async applyEvent(input) {
      // Serializable conflicts (P2034) are expected when Razorpay delivers
      // several events for one subscription at once. The receipt insert rolls
      // back with the failed attempt, so retrying is idempotent.
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await client.$transaction(
            (transaction) => applyInTransaction(transaction, input),
            { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
          );
        } catch (error) {
          if ((error as { code?: string }).code !== "P2034" || attempt >= APPLY_EVENT_ATTEMPTS) throw error;
        }
      }
    },
  };
}

export function createWebhookProcessor(dependencies: {
  repository: BillingWebhookRepository;
  env: Pick<ServerEnv, "razorpay">;
  invalidate: (workspaceId: string) => void;
  now?: () => Date;
}) {
  return {
    async process(input: { eventId: string; rawBody: Buffer; signature: string }) {
      const secret = dependencies.env.razorpay.webhookSecret;
      if (!secret) throw new WebhookError("billing_not_configured");
      if (!verifyWebhookSignature({ rawBody: input.rawBody, signature: input.signature, secret })) {
        throw new WebhookError("invalid_webhook_signature");
      }
      let payload: unknown;
      try { payload = JSON.parse(input.rawBody.toString("utf8")); } catch { throw new WebhookError("invalid_webhook_payload"); }
      const normalized = normalizeRazorpaySubscriptionEvent(payload, dependencies.env);
      if (!normalized) return { outcome: "ignored" as const };
      const result = await dependencies.repository.applyEvent({
        ...normalized,
        eventId: input.eventId,
        payloadHash: createHash("sha256").update(input.rawBody).digest("hex"),
        now: dependencies.now?.() ?? new Date(),
      });
      if (result.outcome === "applied" && result.workspaceId) dependencies.invalidate(result.workspaceId);
      return { outcome: result.outcome };
    },
  };
}

let productionProcessor: ReturnType<typeof createWebhookProcessor> | undefined;

export function getWebhookProcessor() {
  productionProcessor ??= createWebhookProcessor({
    repository: createPrismaBillingWebhookRepository(),
    env: getServerEnv(),
    invalidate: (workspaceId) => getEntitlementService().invalidateWorkspace(workspaceId),
  });
  return productionProcessor;
}
