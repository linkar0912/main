import "server-only";

import { consumeAdminChallenge, createAdminChallenge } from "../challenges";
import type { AdminWriteContext } from "../request-guard";
import { AdminWorkspaceError } from "../workspace-service";
import { enqueueAdminDeletion } from "@/src/lib/queue";
import { previewDeletion } from "./impact";
import { createDeletionJob, getDeletionJobByIdempotencyKey, requestDeletionCancellation, resetFailedDeletion } from "./repository";
import type { DeletionTarget } from "./types";

export async function prepareDeletion(target: DeletionTarget, actor: { userId: string; sessionId: string }) {
  const preview = await previewDeletion(target);
  const challenge = await createAdminChallenge({
    userId: actor.userId, sessionId: actor.sessionId, action: "deletion.create",
    targetType: target.kind, targetId: target.id, expectedVersion: preview.impactDigest,
    confirmation: preview.confirmationPhrase,
  });
  return { ...preview, challenge };
}

export async function requestPermanentDeletion(input: {
  target: DeletionTarget; impactDigest: string; confirmation: string; challengeToken: string;
  includeAuthUsers: boolean; context: AdminWriteContext;
}) {
  const existing = await getDeletionJobByIdempotencyKey(input.context.idempotencyKey);
  if (existing) {
    if (existing.targetKind !== input.target.kind || existing.targetId !== input.target.id || existing.impactDigest !== input.impactDigest) {
      throw new AdminWorkspaceError(409, "idempotency_conflict");
    }
    if (!await enqueueAdminDeletion(existing.id)) throw new AdminWorkspaceError(503, "deletion_queue_unavailable");
    return existing;
  }
  const fresh = await previewDeletion(input.target);
  if (fresh.impactDigest !== input.impactDigest) throw new AdminWorkspaceError(409, "impact_changed");
  if (input.confirmation !== fresh.confirmationPhrase) throw new AdminWorkspaceError(422, "confirmation_mismatch");
  await consumeAdminChallenge({
    token: input.challengeToken, userId: input.context.owner.userId, sessionId: input.context.owner.sessionId,
    action: "deletion.create", targetType: input.target.kind, targetId: input.target.id,
    expectedVersion: fresh.impactDigest, confirmation: input.confirmation,
  });
  const job = await createDeletionJob({ target: input.target, preview: fresh, includeAuthUsers: input.includeAuthUsers, context: input.context });
  if (!await enqueueAdminDeletion(job.id)) throw new AdminWorkspaceError(503, "deletion_queue_unavailable");
  return job;
}

export async function changeDeletionJob(id: string, action: "cancel" | "retry", context: AdminWriteContext) {
  const job = action === "cancel" ? await requestDeletionCancellation(id, context.owner.userId) : await resetFailedDeletion(id);
  if (action === "retry" && !await enqueueAdminDeletion(id)) throw new AdminWorkspaceError(503, "deletion_queue_unavailable");
  return job;
}
