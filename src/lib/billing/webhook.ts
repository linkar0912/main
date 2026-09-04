import "server-only";

import { createHash } from "node:crypto";
import { AdminAuditPhase, BillingSubscriptionStatus, BillingWebhookState, Prisma, type PrismaClient } from "@prisma/client";

import { getServerEnv, type ServerEnv } from "@/src/lib/env";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import { resolveLinkarPlanFromRazorpayId } from "./catalog";
import { verifyWebhookSignature } from "./signatures";
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
]);

export type NormalizedRazorpayEvent = {
  eventType: string;
  subscriptionId: string;
  providerPlanId: string;
  linkarPlanId: string;
  interval: BillingInterval;
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

function normalizedStatus(eventType: string): BillingSubscriptionStatus {
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
  return mapping[suffix];
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
  const trustedPlan = resolveLinkarPlanFromRazorpayId(providerPlanId, env);
  if (!trustedPlan) throw new WebhookError("invalid_webhook_payload");
  const notes = record(entity.notes);
  return {
    eventType,
    subscriptionId: requiredString(entity.id),
    providerPlanId,
    linkarPlanId: trustedPlan.planId,
    interval: trustedPlan.interval,
    providerStatus: requiredString(entity.status),
    status: normalizedStatus(eventType),
    providerCreatedAt: unixDate(root?.created_at, true)!,
    currentPeriodStart: unixDate(entity.current_start),
    currentPeriodEnd: unixDate(entity.current_end),
    customerId: typeof entity.customer_id === "string" ? entity.customer_id : undefined,
    workspaceId: typeof notes?.workspace_id === "string" ? notes.workspace_id : undefined,
    attemptId: typeof notes?.attempt_id === "string" ? notes.attempt_id : undefined,
  };
}

const GRANT_EVENTS = new Set(["subscription.activated", "subscription.charged", "subscription.resumed"]);
const PAID_THROUGH_EVENTS = new Set([
  "subscription.pending", "subscription.halted", "subscription.paused",
  "subscription.cancelled", "subscription.completed", "subscription.expired",
]);

export function entitlementPlanForEvent(
  event: NormalizedRazorpayEvent,
  currentPlanId: string,
  now: Date,
): string {
  if (GRANT_EVENTS.has(event.eventType)) return event.linkarPlanId;
  if (PAID_THROUGH_EVENTS.has(event.eventType)) {
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

export function isStaleProviderEvent(lastAt: Date | null, lastId: string | null, nextAt: Date, nextId: string): boolean {
  if (!lastAt) return false;
  const timeDifference = nextAt.getTime() - lastAt.getTime();
  return timeDifference < 0 || (timeDifference === 0 && Boolean(lastId && nextId <= lastId));
}

export function createPrismaBillingWebhookRepository(client: WebhookPrismaClient = prisma): BillingWebhookRepository {
  return {
    async applyEvent(input) {
      try {
        return await client.$transaction(async (transaction) => {
          const receipt = await transaction.billingWebhookEvent.create({
            data: {
              id: createId("billing_event"), eventId: input.eventId, eventType: input.eventType,
              entityId: input.subscriptionId, providerCreatedAt: input.providerCreatedAt,
              payloadHash: input.payloadHash,
            },
          });
          const current = await transaction.billingSubscription.findUnique({
            where: { providerSubscriptionId: input.subscriptionId },
          });
          const attempt = current ? null : await transaction.billingCheckoutAttempt.findFirst({
            where: {
              ...(input.attemptId ? { id: input.attemptId } : { providerSubscriptionId: input.subscriptionId }),
              providerSubscriptionId: input.subscriptionId,
            },
          });
          const workspaceId = current?.workspaceId ?? attempt?.workspaceId;
          if (!workspaceId || (input.workspaceId && input.workspaceId !== workspaceId) || (attempt && attempt.planId !== input.linkarPlanId)) {
            await transaction.billingWebhookEvent.update({
              where: { id: receipt.id }, data: { state: BillingWebhookState.IGNORED, processedAt: input.now },
            });
            return { outcome: "ignored" as const };
          }
          if (current && isStaleProviderEvent(current.lastProviderEventAt, current.lastProviderEventId, input.providerCreatedAt, input.eventId)) {
            await transaction.billingWebhookEvent.update({
              where: { id: receipt.id }, data: { workspaceId, state: BillingWebhookState.IGNORED, processedAt: input.now },
            });
            return { outcome: "stale" as const, workspaceId };
          }
          const entitlement = await transaction.workspaceEntitlement.findUnique({ where: { workspaceId } });
          const currentPlanId = entitlement?.planId ?? "plan_free";
          const nextPlanId = entitlementPlanForEvent(input, currentPlanId, input.now);
          await transaction.billingSubscription.upsert({
            where: { workspaceId },
            create: {
              id: createId("billing"), workspaceId, planId: input.linkarPlanId, interval: input.interval,
              providerSubscriptionId: input.subscriptionId, providerCustomerId: input.customerId,
              providerPlanId: input.providerPlanId, status: input.status, providerStatus: input.providerStatus,
              currentPeriodStart: input.currentPeriodStart, currentPeriodEnd: input.currentPeriodEnd,
              lastProviderEventAt: input.providerCreatedAt, lastProviderEventId: input.eventId,
            },
            update: {
              planId: input.linkarPlanId, interval: input.interval, providerSubscriptionId: input.subscriptionId,
              providerCustomerId: input.customerId, providerPlanId: input.providerPlanId,
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
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return { outcome: "duplicate" as const };
        throw error;
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
