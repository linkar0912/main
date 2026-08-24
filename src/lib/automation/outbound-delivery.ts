import { createId } from "../id";
import { MetaApiError } from "../meta/client";
import { getRepository } from "../repository-provider";
import type {
  AutomationRepository,
  EnsureOutboundDeliveryInput,
  OutboundDeliveryRecord,
} from "../repository";

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
};

export type DeliveryExecutionResult =
  | { status: "SENT"; providerMessageId?: string; reused: boolean }
  | { status: "FAILED"; retryable: boolean; error: string }
  | { status: "UNKNOWN"; error: string }
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

export function classifyProviderFailure(error: unknown): ProviderFailureClass {
  if (
    !(error instanceof MetaApiError)
    || !error.responseReceived
    || error.status === 0
  ) return "AMBIGUOUS";
  if (error.status === 408 || error.status === 429 || error.status >= 500) {
    return "KNOWN_RETRYABLE";
  }
  return "KNOWN_PERMANENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
    return { status: "UNKNOWN", error: record.lastError ?? "Provider result is ambiguous" };
  }
  if (record.state === "CLAIMED") return { status: "BUSY" };
  if (record.state === "FAILED" && !record.retryable) {
    return { status: "FAILED", retryable: false, error: record.lastError ?? "Delivery failed" };
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
    ...deliveryInput
  } = request;
  const repository = suppliedRepository ?? getRepository();
  const ensured = await repository.ensureOutboundDelivery(deliveryInput);
  const terminal = existingResult(ensured);
  if (terminal) return terminal;

  const owner = createId("delivery_claim");
  const leaseUntil = new Date(Date.now() + claimLeaseMs).toISOString();
  const claim = await repository.claimOutboundDelivery(request.deliveryKey, owner, leaseUntil);
  if (!claim.claimed) return existingResult(claim.record) ?? { status: "BUSY" };

  let providerResult: { id?: string; message_id?: string };
  try {
    providerResult = await send(claim.record.payload as TPayload);
  } catch (error) {
    const message = errorMessage(error);
    const classification = classifyProviderFailure(error);
    if (classification === "AMBIGUOUS") {
      await repository.markOutboundDeliveryUnknown(request.deliveryKey, owner, message)
        .catch(() => false);
      return { status: "UNKNOWN", error: message };
    }

    const retryable = classification === "KNOWN_RETRYABLE";
    await repository.failOutboundDelivery(
      request.deliveryKey,
      owner,
      message,
      retryable,
      retryable ? "RETRYABLE_REJECTION" : "PROVIDER_REJECTED",
    ).catch(() => false);
    return { status: "FAILED", retryable, error: message };
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
      await repository.markOutboundDeliveryUnknown(request.deliveryKey, owner, message)
        .catch(() => false);
      return { status: "UNKNOWN", error: message };
    }
  } catch (error) {
    const message = errorMessage(error);
    await repository.markOutboundDeliveryUnknown(request.deliveryKey, owner, message)
      .catch(() => false);
    return { status: "UNKNOWN", error: message };
  }

  return { status: "SENT", providerMessageId, reused: false };
}
