import type { AutomationRepository, OutboundDeliveryResultCode } from "../repository";
import { unsealSecret } from "../security/secrets";
import type { MetaConnection } from "../meta/types";
import { MetaApiError } from "../meta/client";
import { logger } from "../logger";
import type { BroadcastSendJob } from "../queue";
import { executeOutboundDelivery } from "./outbound-delivery";

export type BroadcastRunnerOptions = {
  client?: {
    sendDirectMessage: (
      connection: MetaConnection,
      recipientId: string,
      message: { type: "text"; text: string },
    ) => Promise<unknown>;
  };
  tokenEncryptionKey?: string;
  finalAttempt?: boolean;
  claimLeaseMs?: number;
};

async function markKnownBroadcastOutcome(
  repository: AutomationRepository,
  job: BroadcastSendJob,
  error: string,
  resultCode: Extract<
    OutboundDeliveryResultCode,
    "SUPPRESSED" | "WINDOW_CLOSED" | "PROVIDER_REJECTED"
  >,
): Promise<void> {
  const owner = `broadcast_guard:${job.deliveryKey}`;
  const claim = await repository.claimOutboundDelivery(
    job.deliveryKey,
    owner,
    new Date(Date.now() + 30_000).toISOString(),
  );
  if (claim.claimed) {
    await repository.failOutboundDelivery(
      job.deliveryKey,
      owner,
      error,
      false,
      resultCode,
    );
  }
}

/** Delivers one broadcast recipient through its pre-created ledger row. */
export async function processBroadcastSend(
  job: BroadcastSendJob,
  repository: AutomationRepository,
  options: BroadcastRunnerOptions,
): Promise<void> {
  const persisted = await repository.getOutboundDelivery(job.deliveryKey);
  if (!persisted || persisted.broadcastId !== job.broadcastId || persisted.workspaceId !== job.workspaceId) {
    throw new Error("Broadcast delivery record is missing or does not match the job");
  }
  if (await repository.getWorkspaceStatus(job.workspaceId) !== "ACTIVE") {
    await markKnownBroadcastOutcome(repository, job, "Workspace is not active", "SUPPRESSED");
    await repository.reconcileBroadcastCounters(job.workspaceId, job.broadcastId);
    return;
  }

  const contact = await repository.getContact(job.workspaceId, job.igAccountId, job.igScopedUserId);
  if (!contact || contact.suppressedAt) {
    await markKnownBroadcastOutcome(repository, job, "Recipient is suppressed", "SUPPRESSED");
    await repository.reconcileBroadcastCounters(job.workspaceId, job.broadcastId);
    return;
  }

  const mapping = await repository.findWorkspaceByInstagramAccount(job.igAccountId);
  if (!mapping || mapping.workspaceId !== job.workspaceId) {
    await markKnownBroadcastOutcome(
      repository,
      job,
      "Instagram account mapping is unavailable",
      "PROVIDER_REJECTED",
    );
    await repository.reconcileBroadcastCounters(job.workspaceId, job.broadcastId);
    return;
  }

  if (!options.client || !options.tokenEncryptionKey) {
    await markKnownBroadcastOutcome(repository, job, "Meta delivery is disabled", "SUPPRESSED");
    await repository.reconcileBroadcastCounters(job.workspaceId, job.broadcastId);
    return;
  }

  const connection: MetaConnection = {
    igUserId: mapping.connection.igUserId,
    accessToken: unsealSecret(mapping.connection.accessTokenEncrypted, options.tokenEncryptionKey),
  };
  const delivery = await executeOutboundDelivery({
    deliveryKey: persisted.deliveryKey,
    workspaceId: persisted.workspaceId,
    broadcastId: persisted.broadcastId,
    instagramAccountId: persisted.instagramAccountId,
    recipientId: persisted.recipientId,
    kind: "BROADCAST_RECIPIENT",
    payload: persisted.payload,
    claimLeaseMs: options.claimLeaseMs ?? 30_000,
    repository,
  }, async (payload) => {
    const response = await options.client!.sendDirectMessage(
      connection,
      job.igScopedUserId,
      payload as { type: "text"; text: string },
    );
    const messageId = typeof response === "object" && response !== null
      && "message_id" in response && typeof response.message_id === "string"
      ? response.message_id
      : undefined;
    return { id: messageId };
  });

  await repository.reconcileBroadcastCounters(job.workspaceId, job.broadcastId);

  if (delivery.status === "FAILED" && delivery.retryable && !options.finalAttempt) {
    throw new MetaApiError(delivery.error, 503, true);
  }
  if (delivery.status === "FAILED" || delivery.status === "UNKNOWN") {
    logger.warn("Broadcast recipient delivery did not complete", {
      broadcastId: job.broadcastId,
      status: delivery.status,
    });
  }
}
