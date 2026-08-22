import type { AutomationRepository } from "../repository";
import { unsealSecret } from "../security/secrets";
import type { MetaConnection } from "../meta/types";
import { MetaApiError } from "../meta/client";
import { logger } from "../logger";
import type { BroadcastSendJob } from "../queue";

export type BroadcastRunnerOptions = {
  client?: { sendDirectMessage: (connection: MetaConnection, recipientId: string, message: { type: "text"; text: string }) => Promise<unknown> };
  tokenEncryptionKey?: string;
  finalAttempt?: boolean;
};

/**
 * Delivers one broadcast DM. Suppressed contacts are skipped (counted, not messaged);
 * retryable Meta failures throw so BullMQ retries the job; the final attempt records
 * the failure permanently. Counters are incremented atomically and completion is
 * finalized once every recipient has been accounted for.
 */
export async function processBroadcastSend(
  payload: BroadcastSendJob,
  repository: AutomationRepository,
  options: BroadcastRunnerOptions,
): Promise<void> {
  const contact = await repository.getContact(payload.workspaceId, payload.igAccountId, payload.igScopedUserId);

  if (!contact || contact.suppressedAt) {
    await repository.incrementBroadcastCounters(payload.broadcastId, { skipped: 1 });
    await repository.finalizeBroadcastIfDone(payload.workspaceId, payload.broadcastId);
    return;
  }

  const mapping = await repository.findWorkspaceByInstagramAccount(payload.igAccountId);
  if (!mapping || mapping.workspaceId !== payload.workspaceId) {
    await repository.incrementBroadcastCounters(payload.broadcastId, { failed: 1 });
    await repository.finalizeBroadcastIfDone(payload.workspaceId, payload.broadcastId);
    return;
  }

  if (!options.client || !options.tokenEncryptionKey) {
    // No Meta transport configured — count as skipped so the broadcast still completes.
    await repository.incrementBroadcastCounters(payload.broadcastId, { skipped: 1 });
    await repository.finalizeBroadcastIfDone(payload.workspaceId, payload.broadcastId);
    return;
  }

  try {
    const connection: MetaConnection = {
      igUserId: mapping.connection.igUserId,
      accessToken: unsealSecret(mapping.connection.accessTokenEncrypted, options.tokenEncryptionKey),
    };
    await options.client.sendDirectMessage(connection, payload.igScopedUserId, { type: "text", text: payload.text });
    await repository.incrementBroadcastCounters(payload.broadcastId, { sent: 1 });
    await repository.finalizeBroadcastIfDone(payload.workspaceId, payload.broadcastId);
  } catch (error) {
    if (error instanceof MetaApiError && error.retryable && !options.finalAttempt) {
      throw error; // BullMQ retries with backoff
    }
    logger.error("Broadcast DM failed", {
      broadcastId: payload.broadcastId,
      error: error instanceof Error ? error.message : String(error),
    });
    await repository.incrementBroadcastCounters(payload.broadcastId, { failed: 1 });
    await repository.finalizeBroadcastIfDone(payload.workspaceId, payload.broadcastId);
  }
}
