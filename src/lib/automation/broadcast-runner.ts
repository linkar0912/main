import type { AutomationRepository, OutboundDeliveryResultCode } from "../repository";
import { unsealSecret } from "../security/secrets";
import type { MetaConnection } from "../meta/types";
import { MetaApiError } from "../meta/client";
import { logger } from "../logger";
import type { BroadcastSendJob } from "../queue";
import { executeOutboundDelivery } from "./outbound-delivery";
import { isQuietNow, isWithinMessagingWindow, msUntilQuietEnd } from "../messaging-window";
import { checkSendRateLimit } from "./send-rate-limiter";
import { findSendDeferral, SendDeferredError } from "./send-deferral";

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

type BroadcastOutcome = "sent" | "failed" | "skipped";

/** Returns true only when this call moved the row to its terminal state. */
async function markKnownBroadcastOutcome(
  repository: AutomationRepository,
  job: BroadcastSendJob,
  error: string,
  resultCode: Extract<
    OutboundDeliveryResultCode,
    "SUPPRESSED" | "WINDOW_CLOSED" | "PROVIDER_REJECTED"
  >,
): Promise<boolean> {
  const owner = `broadcast_guard:${job.deliveryKey}`;
  const claim = await repository.claimOutboundDelivery(
    job.deliveryKey,
    owner,
    new Date(Date.now() + 30_000).toISOString(),
  );
  if (!claim.claimed) return false;
  return repository.failOutboundDelivery(
    job.deliveryKey,
    owner,
    error,
    false,
    resultCode,
  );
}

/**
 * Keeps the broadcast's progress counters current without re-aggregating the
 * whole recipient ledger for every recipient (which made a blast O(N²)). An
 * outcome this job just produced is a single counter increment; the exact
 * ledger reconciliation runs only when the counters say the blast is done (or
 * on the first recipient, to move a scheduled blast to RUNNING), and whenever
 * the outcome was already recorded by an earlier attempt - a retry after a
 * crash cannot know whether that attempt's increment landed.
 */
async function settleBroadcast(
  repository: AutomationRepository,
  job: BroadcastSendJob,
  outcome: BroadcastOutcome | null,
): Promise<void> {
  if (!outcome) {
    await repository.reconcileBroadcastCounters(job.workspaceId, job.broadcastId);
    return;
  }
  await repository.incrementBroadcastCounters(job.broadcastId, { [outcome]: 1 });
  const broadcast = await repository.getBroadcast(job.workspaceId, job.broadcastId);
  if (!broadcast) return;
  if (broadcast.status === "PENDING" || broadcast.sent + broadcast.failed + broadcast.skipped >= broadcast.total) {
    await repository.reconcileBroadcastCounters(job.workspaceId, job.broadcastId);
  }
}

async function skipRecipient(
  repository: AutomationRepository,
  job: BroadcastSendJob,
  error: string,
  resultCode: "SUPPRESSED" | "WINDOW_CLOSED" | "PROVIDER_REJECTED",
): Promise<void> {
  const transitioned = await markKnownBroadcastOutcome(repository, job, error, resultCode);
  await settleBroadcast(
    repository,
    job,
    transitioned ? (resultCode === "PROVIDER_REJECTED" ? "failed" : "skipped") : null,
  );
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
  try {
    await deliverBroadcastRecipient(job, persisted, repository, options);
  } catch (error) {
    // A deferral is not a failure: the worker parks the job until it may send.
    if (findSendDeferral(error) || !options.finalAttempt) throw error;
    // Out of attempts: settle the row so the broadcast can still finish
    // instead of showing RUNNING forever behind a recipient no job will retry.
    await skipRecipient(
      repository,
      job,
      error instanceof Error ? error.message : "Broadcast delivery could not be completed",
      "PROVIDER_REJECTED",
    ).catch(() => undefined);
    throw error;
  }
}

async function deliverBroadcastRecipient(
  job: BroadcastSendJob,
  persisted: NonNullable<Awaited<ReturnType<AutomationRepository["getOutboundDelivery"]>>>,
  repository: AutomationRepository,
  options: BroadcastRunnerOptions,
): Promise<void> {
  if (await repository.getWorkspaceStatus(job.workspaceId) !== "ACTIVE") {
    await skipRecipient(repository, job, "Workspace is not active", "SUPPRESSED");
    return;
  }

  // A cancelled (or deleted) broadcast must not send to anyone still queued.
  const broadcast = await repository.getBroadcast(job.workspaceId, job.broadcastId);
  if (!broadcast || broadcast.status === "CANCELLED") {
    await skipRecipient(repository, job, "Broadcast was cancelled", "SUPPRESSED");
    return;
  }

  const contact = await repository.getContact(job.workspaceId, job.igAccountId, job.igScopedUserId);
  if (!contact || contact.suppressedAt) {
    await skipRecipient(repository, job, "Recipient is suppressed", "SUPPRESSED");
    return;
  }

  // Meta's 24-hour messaging window. This runner previously declared
  // WINDOW_CLOSED in its result-code union but never actually checked the
  // window, so a blast delivered to every non-suppressed contact regardless of
  // when they last messaged the account - including the inactive_7d and
  // inactive_30d segments, which by construction select only contacts whose
  // window closed 7+ or 30+ days ago. That is an unsolicited automated DM in
  // Meta's terms and is exactly what gets a professional account restricted.
  if (!isWithinMessagingWindow(contact.lastSeenAt)) {
    await skipRecipient(repository, job, "The 24-hour messaging window has closed", "WINDOW_CLOSED");
    return;
  }

  const mapping = await repository.findWorkspaceByInstagramAccount(job.igAccountId);
  if (!mapping || mapping.workspaceId !== job.workspaceId) {
    await skipRecipient(repository, job, "Instagram account mapping is unavailable", "PROVIDER_REJECTED");
    return;
  }

  if (!options.client || !options.tokenEncryptionKey) {
    await skipRecipient(repository, job, "Meta delivery is disabled", "SUPPRESSED");
    return;
  }

  // Quiet hours and the account's bulk send budget both defer the job until
  // it may send. A deferral that would outlive the recipient's 24-hour window
  // can never deliver, so that recipient is settled as WINDOW_CLOSED now
  // rather than parked and retried into a policy violation.
  const defer = async (message: string, delayMs: number) => {
    const deferral = new SendDeferredError(message, delayMs);
    if (!isWithinMessagingWindow(contact.lastSeenAt, Date.now() + deferral.delayMs)) {
      await skipRecipient(repository, job, "The 24-hour messaging window closes before the send could go out", "WINDOW_CLOSED");
      return;
    }
    throw deferral;
  };
  const messagingWindow = await repository.getMessagingWindow(job.workspaceId);
  const now = new Date();
  if (messagingWindow && isQuietNow(now, messagingWindow)) {
    await defer("Quiet hours are active for this workspace", msUntilQuietEnd(now, messagingWindow));
    return;
  }

  // Broadcasts draw on the bulk share of the account's DM budget so a blast
  // can never use up the capacity live conversations need.
  const rateLimit = await checkSendRateLimit(mapping.connection.igUserId, "direct_message", "bulk");
  if (!rateLimit.allowed) {
    await defer("Send rate limit reached for this Instagram account", rateLimit.retryAfterMs);
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

  if (delivery.status === "FAILED" && delivery.retryable && !options.finalAttempt) {
    throw new MetaApiError(delivery.error, 503, true);
  }
  if (delivery.status === "BUSY") return; // the claim holder settles the counters
  const outcome: BroadcastOutcome | null = delivery.reused
    ? null
    : delivery.status === "SENT" ? "sent" : "failed";
  await settleBroadcast(repository, job, outcome);

  if (delivery.status === "FAILED" || delivery.status === "UNKNOWN") {
    logger.warn("Broadcast recipient delivery did not complete", {
      broadcastId: job.broadcastId,
      status: delivery.status,
    });
  }
}
