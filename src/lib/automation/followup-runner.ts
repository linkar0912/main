import type { AutomationRepository, OutboundDeliveryResultCode } from "../repository";
import { unsealSecret } from "../security/secrets";
import type { MetaConnection } from "../meta/types";
import { MetaApiError } from "../meta/client";
import { logger } from "../logger";
import type { FlowFollowUpJob } from "../queue";
import { executeOutboundDelivery } from "./outbound-delivery";

export type FlowFollowUpRunnerOptions = {
  client?: {
    sendDirectMessage: (
      connection: MetaConnection,
      recipientId: string,
      message: FlowFollowUpJob["message"],
    ) => Promise<unknown>;
  };
  tokenEncryptionKey?: string;
  finalAttempt?: boolean;
  claimLeaseMs?: number;
};

/** Meta's human-agent messaging window: DMs are only deliverable within 24h of the person's last message. */
const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1_000;

async function markKnownOutcome(
  repository: AutomationRepository,
  job: FlowFollowUpJob,
  error: string,
  resultCode: Extract<OutboundDeliveryResultCode, "SUPPRESSED" | "WINDOW_CLOSED" | "PROVIDER_REJECTED">,
): Promise<void> {
  // The ledger row may not exist yet - skips can happen on the very first
  // processing pass, so ensure it before claiming.
  await repository.ensureOutboundDelivery({
    deliveryKey: job.deliveryKey,
    workspaceId: job.workspaceId,
    automationId: job.automationId,
    instagramAccountId: job.instagramAccountId,
    recipientId: job.recipientId,
    kind: "FLOW_FOLLOWUP",
    payload: { ...job.message },
  });
  const owner = `followup_guard:${job.deliveryKey}`;
  const claim = await repository.claimOutboundDelivery(
    job.deliveryKey,
    owner,
    new Date(Date.now() + 30_000).toISOString(),
  );
  if (claim.claimed) {
    await repository.failOutboundDelivery(job.deliveryKey, owner, error, false, resultCode);
  }
}

/**
 * Delivers one scheduled flow follow-up through its ledger row. Skips - never
 * retries - when the automation was paused/deleted, the person opted out, or
 * the 24-hour messaging window closed while the nudge waited in the queue.
 */
export async function processFlowFollowUp(
  job: FlowFollowUpJob,
  repository: AutomationRepository,
  options: FlowFollowUpRunnerOptions,
): Promise<void> {
  const persisted = await repository.getOutboundDelivery(job.deliveryKey);
  if (persisted && (persisted.workspaceId !== job.workspaceId || persisted.automationId !== job.automationId)) {
    throw new Error("Flow follow-up record does not match the job");
  }

  const skip = async (error: string, resultCode: "SUPPRESSED" | "WINDOW_CLOSED" | "PROVIDER_REJECTED") => {
    await markKnownOutcome(repository, job, error, resultCode);
    logger.info("Flow follow-up skipped", {
      workspaceId: job.workspaceId,
      automationId: job.automationId,
      reason: resultCode,
    });
  };

  const automation = await repository.getAutomation(job.workspaceId, job.automationId);
  if (!automation || automation.status !== "ACTIVE") {
    await skip("Automation is not active", "SUPPRESSED");
    return;
  }

  const contact = await repository.getContact(job.workspaceId, job.instagramAccountId, job.recipientId);
  if (contact?.suppressedAt) {
    await skip("Recipient is suppressed", "SUPPRESSED");
    return;
  }
  const lastTouchMs = contact?.lastSeenAt ? Date.parse(contact.lastSeenAt) : Number.NaN;
  if (!Number.isFinite(lastTouchMs) || Date.now() >= lastTouchMs + MESSAGING_WINDOW_MS) {
    await skip("The 24-hour messaging window has closed", "WINDOW_CLOSED");
    return;
  }

  if (!options.client || !options.tokenEncryptionKey) {
    await skip("Meta delivery is disabled", "PROVIDER_REJECTED");
    return;
  }

  const mapping = await repository.findWorkspaceByInstagramAccount(job.instagramAccountId);
  if (!mapping || mapping.workspaceId !== job.workspaceId) {
    await skip("Instagram account mapping is unavailable", "PROVIDER_REJECTED");
    return;
  }

  const connection: MetaConnection = {
    igUserId: mapping.connection.igUserId,
    accessToken: unsealSecret(mapping.connection.accessTokenEncrypted, options.tokenEncryptionKey),
  };
  const delivery = await executeOutboundDelivery({
    deliveryKey: job.deliveryKey,
    workspaceId: job.workspaceId,
    automationId: job.automationId,
    instagramAccountId: job.instagramAccountId,
    recipientId: job.recipientId,
    kind: "FLOW_FOLLOWUP",
    payload: { ...job.message },
    claimLeaseMs: options.claimLeaseMs ?? 30_000,
    repository,
  }, async (payload) => {
    const response = await options.client!.sendDirectMessage(connection, job.recipientId, payload as FlowFollowUpJob["message"]);
    const messageId = typeof response === "object" && response !== null
      && "message_id" in response && typeof response.message_id === "string"
      ? response.message_id
      : undefined;
    return { id: messageId };
  });

  if (delivery.status === "FAILED" && delivery.retryable && !options.finalAttempt) {
    throw new MetaApiError(delivery.error, 503, true);
  }
  if (delivery.status === "FAILED" || delivery.status === "UNKNOWN") {
    logger.warn("Flow follow-up did not complete", {
      automationId: job.automationId,
      status: delivery.status,
    });
  }
}
