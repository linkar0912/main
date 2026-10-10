import { createId } from "../id";
import { logger } from "../logger";
import { MetaApiError } from "../meta/client";
import { notifyWorkspaceManagers } from "../notifications";
import { getRepository } from "../repository-provider";
import type {
  AutomationRepository,
  EnsureOutboundDeliveryInput,
  OutboundDeliveryRecord,
} from "../repository";
import type { DeliveryTimingObserver } from "./delivery-timing";

export type ProviderFailureClass =
  | "KNOWN_RETRYABLE"
  | "KNOWN_PERMANENT"
  | "AMBIGUOUS";

export type DeliveryExecutionRequest<
  TPayload extends Record<string, unknown>,
> = EnsureOutboundDeliveryInput & {
  payload: TPayload;
  claimLeaseMs: number;
  repository?: AutomationRepository;
  timingObserver?: DeliveryTimingObserver;
  /** Treat network-level failures as retryable instead of UNKNOWN (lead webhooks). */
  networkFailuresAreRetryable?: boolean;
  entitlementService?: {
    getMonthlyDeliveryLimit(workspaceId: string): Promise<number | null>;
  };
};

export type DeliveryExecutionResult =
  | { status: "SENT"; providerMessageId?: string; reused: boolean }
  // `reused` marks an outcome some earlier attempt already recorded, so a
  // caller keeping per-outcome counters can tell it apart from a fresh one.
  | { status: "FAILED"; retryable: boolean; error: string; reused?: true }
  | { status: "UNKNOWN"; error: string; reused?: true }
  | { status: "BUSY" };

export const deliveryKeys = {
  classicAction: (automationId: string, eventId: string, index: number) =>
    `automation:${automationId}:event:${eventId}:action:${index}`,
  emailCapture: (automationId: string, eventId: string, stage: string) =>
    `automation:${automationId}:event:${eventId}:capture:${stage}`,
  campaignAction: (participantId: string, action: string) =>
    `campaign:${participantId}:action:${action}`,
  sequenceStep: (enrollmentId: string, stepId: string) =>
    `sequence:${enrollmentId}:step:${stepId}`,
  broadcastRecipient: (broadcastId: string, accountId: string, recipientId: string) =>
    `broadcast:${broadcastId}:${accountId}:${recipientId}`,
  lead: (
    contactId: string,
    automationId: string,
    channel: "email" | "webhook",
    stage: string,
  ) => `lead:${contactId}:automation:${automationId}:${channel}:${stage}`,
  followUp: (automationId: string, eventId: string, index: number) =>
    `automation:${automationId}:event:${eventId}:followup:${index}`,
};

export function classifyProviderFailure(
  error: unknown,
  networkFailuresAreRetryable = false,
): ProviderFailureClass {
  if (
    !(error instanceof MetaApiError)
    || !error.responseReceived
    || error.status === 0
  ) return networkFailuresAreRetryable ? "KNOWN_RETRYABLE" : "AMBIGUOUS";
  // Meta reports throttling (Graph codes 4/17/32/613) and other transient
  // errors as HTTP 400 with `retryable` set by the client - a rejection we
  // know was not delivered and may safely try again later.
  if (error.retryable || error.status === 408 || error.status === 429 || error.status >= 500) {
    return "KNOWN_RETRYABLE";
  }
  return "KNOWN_PERMANENT";
}

/** Graph code 190: the access token is invalid, expired or revoked. */
export function isInvalidTokenError(error: unknown): boolean {
  return error instanceof MetaApiError && error.responseReceived && error.code === 190;
}

/**
 * A send rejected with code 190 means every later send on this connection will
 * fail the same way. Mark the connection EXPIRED (which also stops new events
 * from being processed for it) and tell the owners to reconnect, exactly as
 * the token refresher does. Never throws - alerting must not break delivery.
 */
async function expireInvalidInstagramConnection(
  repository: AutomationRepository,
  igUserId: string,
): Promise<void> {
  try {
    const mapping = await repository.findWorkspaceByInstagramAccount(igUserId);
    if (!mapping) return;
    await repository.updateConnectionStatus(mapping.connection.id, "EXPIRED");
    logger.warn("Instagram connection marked expired after an invalid-token send", {
      workspaceId: mapping.workspaceId,
      connectionId: mapping.connection.id,
    });
    await notifyWorkspaceManagers(
      mapping.workspaceId,
      `token-expired:${mapping.connection.id}`,
      `Action needed: reconnect @${mapping.connection.username}`,
      `The Instagram connection for @${mapping.connection.username} expired, so its automations cannot deliver right now. Reconnect the account from Settings to resume.`,
    );
  } catch (error) {
    logger.warn("Could not mark Instagram connection expired", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * UNKNOWN outcomes keep the monthly usage reservation alive forever - the
 * delivery can never be re-claimed to confirm or release it - so every path
 * that marks a delivery UNKNOWN must release the reservation first.
 */
async function markUnknown(
  repository: AutomationRepository,
  deliveryKey: string,
  owner: string | undefined,
  message: string,
): Promise<void> {
  await repository.releaseOutboundDeliveryReservation(deliveryKey).catch(() => false);
  await repository.markOutboundDeliveryUnknown(deliveryKey, owner, message).catch(() => false);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function currentPeriodStart(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function existingResult(record: OutboundDeliveryRecord): DeliveryExecutionResult | null {
  if (record.state === "SENT") {
    return {
      status: "SENT",
      providerMessageId: record.providerMessageId,
      reused: true,
    };
  }
  if (record.state === "UNKNOWN") {
    return { status: "UNKNOWN", error: record.lastError ?? "Provider result is ambiguous", reused: true };
  }
  if (record.state === "CLAIMED") return { status: "BUSY" };
  if (record.state === "FAILED" && !record.retryable) {
    return { status: "FAILED", retryable: false, error: record.lastError ?? "Delivery failed", reused: true };
  }
  return null;
}

export async function executeOutboundDelivery<
  TPayload extends Record<string, unknown>,
>(
  request: DeliveryExecutionRequest<TPayload>,
  send: (payload: TPayload) => Promise<{ id?: string; message_id?: string }>,
): Promise<DeliveryExecutionResult> {
  const {
    claimLeaseMs,
    repository: suppliedRepository,
    entitlementService: suppliedEntitlementService,
    timingObserver,
    networkFailuresAreRetryable,
    ...deliveryInput
  } = request;
  const repository = suppliedRepository ?? getRepository();
  const owner = createId("delivery_claim");
  const leaseUntil = new Date(Date.now() + claimLeaseMs).toISOString();
  const entitlementService = suppliedEntitlementService
    ?? (await import("../entitlements/service")).getEntitlementService();
  let preparation: Awaited<ReturnType<typeof repository.prepareOutboundDelivery>>;
  try {
    const monthlyLimit = await entitlementService.getMonthlyDeliveryLimit(request.workspaceId);
    preparation = await repository.prepareOutboundDelivery({
      ...deliveryInput,
      owner,
      leaseUntil,
      periodStart: currentPeriodStart(new Date()),
      monthlyLimit,
    });
  } catch {
    const error = "Delivery usage could not be reserved";
    return { status: "FAILED", retryable: true, error };
  }
  if (preparation.status === "TERMINAL") {
    return existingResult(preparation.record) ?? { status: "BUSY" };
  }
  if (preparation.status === "BUSY") return { status: "BUSY" };
  if (preparation.status === "QUOTA_REJECTED") {
    return { status: "FAILED", retryable: false, error: "Monthly delivery limit reached" };
  }

  let providerResult: { id?: string; message_id?: string };
  const providerStartedAt = performance.now();
  timingObserver?.providerStarted();
  try {
    providerResult = await send(preparation.record.payload as TPayload);
  } catch (error) {
    const message = errorMessage(error);
    const classification = classifyProviderFailure(error, networkFailuresAreRetryable);
    if (classification === "AMBIGUOUS") {
      await markUnknown(repository, request.deliveryKey, owner, message);
      return { status: "UNKNOWN", error: message };
    }

    const retryable = classification === "KNOWN_RETRYABLE";
    if (isInvalidTokenError(error) && request.instagramAccountId) {
      await expireInvalidInstagramConnection(repository, request.instagramAccountId);
    }
    await repository.releaseOutboundDeliveryReservation(request.deliveryKey).catch(() => false);
    await repository.failOutboundDelivery(
      request.deliveryKey,
      owner,
      message,
      retryable,
      retryable ? "RETRYABLE_REJECTION" : "PROVIDER_REJECTED",
    ).catch(() => false);
    return { status: "FAILED", retryable, error: message };
  } finally {
    timingObserver?.providerFinished(performance.now() - providerStartedAt);
  }

  const providerMessageId = providerResult.id ?? providerResult.message_id;
  const sentAt = new Date().toISOString();
  try {
    const completed = await repository.completeOutboundDelivery(
      request.deliveryKey,
      owner,
      providerMessageId,
      sentAt,
    );
    if (!completed) {
      const message = "Provider succeeded but the delivery claim could not be completed";
      await markUnknown(repository, request.deliveryKey, owner, message);
      return { status: "UNKNOWN", error: message };
    }
  } catch (error) {
    const message = errorMessage(error);
    await markUnknown(repository, request.deliveryKey, owner, message);
    return { status: "UNKNOWN", error: message };
  }

  return { status: "SENT", providerMessageId, reused: false };
}
