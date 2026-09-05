import "server-only";

import { AdminAuditPhase } from "@prisma/client";

import { appendAdminAuditEvent, type AdminAuditInput } from "@/src/lib/admin/audit";
import type { BillingInterval, BillingPlanKey } from "./types";
import { BILLING_PLANS, resolveRazorpayPlanId } from "./catalog";
import type { ServerEnv } from "@/src/lib/env";
import { getServerEnv } from "@/src/lib/env";
import { verifyCheckoutSignature } from "./signatures";
import { createPrismaBillingRepository, type BillingRepository } from "./repository";
import { RazorpayClient } from "./razorpay-client";

type BillingProvider = {
  createSubscription(input: {
    planId: string;
    totalCount: number;
    workspaceId: string;
    attemptId: string;
  }): Promise<{ id: string; status: string }>;
  updateSubscription(input: { subscriptionId: string; planId: string }): Promise<unknown>;
  cancelSubscription(subscriptionId: string): Promise<unknown>;
};

export class BillingServiceError extends Error {
  constructor(public readonly code: "billing_not_configured" | "invalid_checkout_signature" | "subscription_conflict" | "provider_unavailable") {
    super(code);
    this.name = "BillingServiceError";
  }
}

type BillingServiceDependencies = {
  repository: BillingRepository;
  provider: BillingProvider;
  env: Pick<ServerEnv, "razorpay">;
  audit?: (input: AdminAuditInput) => Promise<void>;
  now?: () => Date;
};

export type BillingMutationContext = {
  requestId: string;
  userId: string;
  email: string;
  workspaceId: string;
  ipHash: string;
  userAgent: string;
  origin?: string;
};

function monthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function missingRazorpayConfig(razorpay: ServerEnv["razorpay"]): string[] {
  const values: Array<[string, string | undefined]> = [
    ["RAZORPAY_KEY_ID", razorpay.keyId],
    ["RAZORPAY_KEY_SECRET", razorpay.keySecret],
    ["RAZORPAY_WEBHOOK_SECRET", razorpay.webhookSecret],
    ["RAZORPAY_PLAN_CREATOR_MONTHLY_ID", razorpay.planIds.creator.MONTHLY],
    ["RAZORPAY_PLAN_CREATOR_ANNUAL_ID", razorpay.planIds.creator.ANNUAL],
    ["RAZORPAY_PLAN_GROWTH_MONTHLY_ID", razorpay.planIds.growth.MONTHLY],
    ["RAZORPAY_PLAN_GROWTH_ANNUAL_ID", razorpay.planIds.growth.ANNUAL],
    ["RAZORPAY_PLAN_AGENCY_MONTHLY_ID", razorpay.planIds.agency.MONTHLY],
    ["RAZORPAY_PLAN_AGENCY_ANNUAL_ID", razorpay.planIds.agency.ANNUAL],
  ];
  return values.filter(([, value]) => !value).map(([name]) => name);
}

export function createBillingService(dependencies: BillingServiceDependencies) {
  const now = dependencies.now ?? (() => new Date());

  async function audited<T>(
    context: BillingMutationContext | undefined,
    action: string,
    before: unknown,
    operation: () => Promise<T>,
    summarize: (result: T) => unknown,
  ): Promise<T> {
    if (!context || !dependencies.audit) return operation();
    const base = {
      requestId: context.requestId,
      actorUserId: context.userId,
      actorEmail: context.email,
      sessionId: context.userId,
      action,
      targetType: "billing_subscription",
      targetId: context.workspaceId,
      workspaceId: context.workspaceId,
      reason: "Workspace owner billing action",
      ipHash: context.ipHash,
      userAgent: context.userAgent,
      origin: context.origin,
    };
    await dependencies.audit({ ...base, phase: AdminAuditPhase.ATTEMPT, before });
    try {
      const result = await operation();
      await dependencies.audit({ ...base, phase: AdminAuditPhase.SUCCESS, before, after: summarize(result) });
      return result;
    } catch (error) {
      await dependencies.audit({
        ...base,
        phase: AdminAuditPhase.FAILURE,
        before,
        errorCode: error instanceof BillingServiceError ? error.code : "billing_operation_failed",
      });
      throw error;
    }
  }

  function configuredCredentials(): { keyId: string; keySecret: string } {
    const { keyId, keySecret } = dependencies.env.razorpay;
    if (!keyId || !keySecret) throw new BillingServiceError("billing_not_configured");
    return { keyId, keySecret };
  }

  async function getBillingView(workspaceId: string, role: string) {
    const current = now();
    const data = await dependencies.repository.getBillingView(workspaceId, monthStart(current));
    const billingMissing = missingRazorpayConfig(dependencies.env.razorpay);
    return {
      ...data,
      catalog: Object.values(BILLING_PLANS),
      canManage: role === "OWNER",
      billingConfigured: billingMissing.length === 0,
      billingMissing,
    };
  }

  async function createCheckout(workspaceId: string, plan: BillingPlanKey, interval: BillingInterval, context?: BillingMutationContext) {
    return audited(context, "billing.checkout.create", { plan, interval }, async () => {
      const credentials = configuredCredentials();
      let providerPlanId: string;
      try {
        providerPlanId = resolveRazorpayPlanId(plan, interval, dependencies.env);
      } catch {
        throw new BillingServiceError("billing_not_configured");
      }
      const current = now();
      const claim = await dependencies.repository.claimCheckout({
        workspaceId,
        planId: `plan_${plan}`,
        interval,
        now: current,
        expiresAt: new Date(current.getTime() + 15 * 60 * 1_000),
      });
      if (claim.kind === "processing") return { status: "processing" as const, attemptId: claim.attemptId };
      if (claim.kind === "conflict") throw new BillingServiceError("subscription_conflict");
      if (claim.kind === "reuse") {
        return { status: "ready" as const, keyId: credentials.keyId, subscriptionId: claim.subscriptionId, attemptId: claim.attemptId };
      }
      let subscription: { id: string; status: string };
      try {
        subscription = await dependencies.provider.createSubscription({
          planId: providerPlanId,
          totalCount: interval === "MONTHLY" ? 120 : 10,
          workspaceId,
          attemptId: claim.attemptId,
        });
      } catch {
        await dependencies.repository.markCheckoutFailed(claim.attemptId, "provider_unavailable");
        throw new BillingServiceError("provider_unavailable");
      }
      await dependencies.repository.markCheckoutReady(claim.attemptId, subscription.id);
      return { status: "ready" as const, keyId: credentials.keyId, subscriptionId: subscription.id, attemptId: claim.attemptId };
    }, (result) => ({ plan, interval, state: result.status, providerSubscriptionId: "subscriptionId" in result ? result.subscriptionId : undefined }));
  }

  async function verifyCheckout(workspaceId: string, input: { paymentId: string; subscriptionId: string; signature: string }) {
    const { keySecret } = configuredCredentials();
    if (!verifyCheckoutSignature({ ...input, secret: keySecret })) {
      throw new BillingServiceError("invalid_checkout_signature");
    }
    const updated = await dependencies.repository.markCheckoutVerified(workspaceId, input.subscriptionId, now());
    if (!updated) throw new BillingServiceError("subscription_conflict");
    return { status: "processing" as const };
  }

  async function schedulePlanChange(workspaceId: string, plan: BillingPlanKey, interval: BillingInterval, context?: BillingMutationContext) {
    const result = await audited(context, "billing.plan.change", { plan, interval }, async () => {
      configuredCredentials();
      const subscription = await dependencies.repository.getSubscriptionForOwnerAction(workspaceId);
      if (!subscription || subscription.status !== "ACTIVE") throw new BillingServiceError("subscription_conflict");
      let providerPlanId: string;
      try {
        providerPlanId = resolveRazorpayPlanId(plan, interval, dependencies.env);
      } catch {
        throw new BillingServiceError("billing_not_configured");
      }
      try {
        await dependencies.provider.updateSubscription({ subscriptionId: subscription.providerSubscriptionId, planId: providerPlanId });
      } catch {
        throw new BillingServiceError("provider_unavailable");
      }
      await dependencies.repository.recordPendingPlanChange(subscription.id, `plan_${plan}`, interval);
      return { status: "scheduled" as const, providerSubscriptionId: subscription.providerSubscriptionId };
    }, (result) => ({ plan, interval, state: result.status, providerSubscriptionId: result.providerSubscriptionId }));
    return { status: result.status };
  }

  async function cancelAtCycleEnd(workspaceId: string, context?: BillingMutationContext) {
    const result = await audited(context, "billing.subscription.cancel", {}, async () => {
      configuredCredentials();
      const subscription = await dependencies.repository.getSubscriptionForOwnerAction(workspaceId);
      if (!subscription || subscription.status !== "ACTIVE") throw new BillingServiceError("subscription_conflict");
      try {
        await dependencies.provider.cancelSubscription(subscription.providerSubscriptionId);
      } catch {
        throw new BillingServiceError("provider_unavailable");
      }
      await dependencies.repository.recordPendingCancellation(subscription.id);
      return { status: "scheduled" as const, providerSubscriptionId: subscription.providerSubscriptionId };
    }, (result) => ({ state: result.status, providerSubscriptionId: result.providerSubscriptionId }));
    return { status: result.status };
  }

  return { getBillingView, createCheckout, verifyCheckout, schedulePlanChange, cancelAtCycleEnd };
}

let productionService: ReturnType<typeof createBillingService> | undefined;

export function getBillingService(): ReturnType<typeof createBillingService> {
  if (productionService) return productionService;
  const env = getServerEnv();
  productionService = createBillingService({
    repository: createPrismaBillingRepository(),
    provider: new RazorpayClient({
      keyId: env.razorpay.keyId ?? "",
      keySecret: env.razorpay.keySecret ?? "",
      timeoutMs: env.providerRequestTimeoutMs,
    }),
    env,
    audit: appendAdminAuditEvent,
  });
  return productionService;
}
