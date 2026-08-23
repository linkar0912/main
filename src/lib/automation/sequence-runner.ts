import { unsealSecret } from "../security/secrets";
import type { AutomationRepository, MessagingWindow } from "../repository";
import type { MetaConnection } from "../meta/types";
import { logger } from "../logger";
import { isQuietNow, msUntilQuietEnd } from "../messaging-window";
import { deliveryKeys, executeOutboundDelivery } from "./outbound-delivery";

export type SequenceRunnerClient = {
  sendDirectMessage: (
    connection: MetaConnection,
    recipientId: string,
    message: { type: "text"; text: string },
  ) => Promise<unknown>;
};

export type SequenceRunnerOptions = {
  client?: SequenceRunnerClient;
  tokenEncryptionKey?: string;
  /** Max sends per sweep — keeps the scheduler polite on shared hosts. */
  batchSize?: number;
  claimLeaseMs?: number;
};

export type SequenceSweepResult = {
  processed: number;
  sent: number;
  failed: number;
  cancelled: number;
};

/**
 * Delivers every sequence step that is due. Runs on a short interval from the worker:
 * for each ACTIVE enrollment whose nextSendAt has passed it DMs the current step, then
 * either schedules the next step or completes the enrollment. Suppressed contacts and
 * paused/deleted sequences are cancelled instead of messaged.
 */
export async function processDueSequences(
  repository: AutomationRepository,
  options: SequenceRunnerOptions,
): Promise<SequenceSweepResult> {
  const result: SequenceSweepResult = { processed: 0, sent: 0, failed: 0, cancelled: 0 };
  const due = await repository.listDueSequenceSends(new Date().toISOString(), options.batchSize ?? 25);
  if (due.length === 0) return result;

  // Without Meta credentials there is nothing to deliver — leave everything as-is
  // so a configured deployment picks the work up instead of failing it here.
  if (!options.client || !options.tokenEncryptionKey) {
    logger.warn("Sequence sweep skipped: Meta client is not configured");
    return result;
  }

  // A sweep spans every workspace with due steps, so the window must be resolved per
  // workspace — reusing one tenant's window would either DM through another tenant's
  // quiet hours or hold a tenant that has none. Cached for the length of the sweep.
  const windowCache = new Map<string, MessagingWindow | null>();
  const messagingWindowFor = async (workspaceId: string): Promise<MessagingWindow | null> => {
    const cached = windowCache.get(workspaceId);
    if (cached !== undefined) return cached;
    const resolved = await repository.getMessagingWindow(workspaceId).catch(() => null);
    windowCache.set(workspaceId, resolved);
    return resolved;
  };

  for (const { enrollment, sequence, contact } of due) {
    result.processed += 1;

    // Quiet hours: hold the step (keep it due) until the window reopens.
    const messagingWindow = await messagingWindowFor(enrollment.workspaceId);
    if (messagingWindow && isQuietNow(new Date(), messagingWindow)) {
      await repository.advanceSequenceEnrollment(
        enrollment.id,
        enrollment.currentStepIndex,
        new Date(Date.now() + msUntilQuietEnd(new Date(), messagingWindow)).toISOString(),
      );
      continue;
    }

    if (contact.suppressedAt) {
      await repository.cancelEnrollmentsForContact(contact.id);
      result.cancelled += 1;
      continue;
    }

    const step = sequence.steps[enrollment.currentStepIndex];
    if (!step) {
      await repository.advanceSequenceEnrollment(enrollment.id, sequence.steps.length, null);
      result.cancelled += 1;
      continue;
    }

    const mapping = await repository.findWorkspaceByInstagramAccount(contact.instagramAccountId);
    if (!mapping || mapping.workspaceId !== enrollment.workspaceId) {
      await repository.cancelEnrollmentsForContact(contact.id);
      result.cancelled += 1;
      continue;
    }

    const connection: MetaConnection = {
      igUserId: mapping.connection.igUserId,
      accessToken: unsealSecret(mapping.connection.accessTokenEncrypted, options.tokenEncryptionKey),
    };
    const delivery = await executeOutboundDelivery({
      deliveryKey: deliveryKeys.sequenceStep(enrollment.id, step.id),
      workspaceId: enrollment.workspaceId,
      sequenceEnrollmentId: enrollment.id,
      instagramAccountId: contact.instagramAccountId,
      recipientId: contact.igScopedUserId,
      kind: "SEQUENCE_STEP",
      payload: { type: "text", text: step.text },
      claimLeaseMs: options.claimLeaseMs ?? 30_000,
      repository,
    }, async (payload) => {
      const response = await options.client!.sendDirectMessage(
        connection,
        contact.igScopedUserId,
        payload as { type: "text"; text: string },
      );
      const messageId = typeof response === "object" && response !== null
        && "message_id" in response && typeof response.message_id === "string"
        ? response.message_id
        : undefined;
      return { id: messageId };
    });
    if (delivery.status !== "SENT") {
      if (delivery.status === "FAILED" || delivery.status === "UNKNOWN") {
        logger.warn("Sequence step delivery did not complete", {
          enrollmentId: enrollment.id,
          status: delivery.status,
        });
        result.failed += 1;
      }
      continue;
    }

    result.sent += 1;
    const nextIndex = enrollment.currentStepIndex + 1;
    const nextStep = sequence.steps[nextIndex];
    if (!nextStep) {
      await repository.advanceSequenceEnrollment(enrollment.id, nextIndex, null);
      continue;
    }
    await repository.advanceSequenceEnrollment(
      enrollment.id,
      nextIndex,
      new Date(Date.now() + nextStep.delayHours * 3_600_000).toISOString(),
    );
  }

  return result;
}
