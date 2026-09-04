import "server-only";

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
  now?: () => Date;
};

function monthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function createBillingService(dependencies: BillingServiceDependencies) {
  const now = dependencies.now ?? (() => new Date());

  function configuredCredentials(): { keyId: string; keySecret: string } {
    const { keyId, keySecret } = dependencies.env.razorpay;
    if (!keyId || !keySecret) throw new BillingServiceError("billing_not_configured");
    return { keyId, keySecret };
  }

  async function getBillingView(workspaceId: string, role: string) {
    const current = now();
    const data = await dependencies.repository.getBillingView(workspaceId, monthStart(current));
    return {
      ...data,
      catalog: Object.values(BILLING_PLANS),
      canManage: role === "OWNER",
      billingConfigured: Boolean(dependencies.env.razorpay.keyId && dependencies.env.razorpay.keySecret),
    };
  }

  async function createCheckout(workspaceId: string, plan: BillingPlanKey, interval: BillingInterval) {
    const credentials = configuredCredentials();
    const providerPlanId = resolveRazorpayPlanId(plan, interval, dependencies.env);
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
    try {
      const subscription = await dependencies.provider.createSubscription({
        planId: providerPlanId,
        totalCount: interval === "MONTHLY" ? 120 : 10,
        workspaceId,
        attemptId: claim.attemptId,
      });
      await dependencies.repository.markCheckoutReady(claim.attemptId, subscription.id);
      return { status: "ready" as const, keyId: credentials.keyId, subscriptionId: subscription.id, attemptId: claim.attemptId };
    } catch {
      await dependencies.repository.markCheckoutFailed(claim.attemptId, "provider_unavailable");
      throw new BillingServiceError("provider_unavailable");
    }
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

  async function schedulePlanChange(workspaceId: string, plan: BillingPlanKey, interval: BillingInterval) {
    configuredCredentials();
    const subscription = await dependencies.repository.getSubscriptionForOwnerAction(workspaceId);
    if (!subscription || subscription.status !== "ACTIVE") throw new BillingServiceError("subscription_conflict");
    const providerPlanId = resolveRazorpayPlanId(plan, interval, dependencies.env);
    try {
      await dependencies.provider.updateSubscription({ subscriptionId: subscription.providerSubscriptionId, planId: providerPlanId });
    } catch {
      throw new BillingServiceError("provider_unavailable");
    }
    await dependencies.repository.recordPendingPlanChange(subscription.id, `plan_${plan}`, interval);
    return { status: "scheduled" as const };
  }

  async function cancelAtCycleEnd(workspaceId: string) {
    configuredCredentials();
    const subscription = await dependencies.repository.getSubscriptionForOwnerAction(workspaceId);
    if (!subscription || subscription.status !== "ACTIVE") throw new BillingServiceError("subscription_conflict");
    try {
      await dependencies.provider.cancelSubscription(subscription.providerSubscriptionId);
    } catch {
      throw new BillingServiceError("provider_unavailable");
    }
    await dependencies.repository.recordPendingCancellation(subscription.id);
    return { status: "scheduled" as const };
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
  });
  return productionService;
}
