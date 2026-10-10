import "server-only";

import { consumeAdminChallenge, createAdminChallenge } from "../challenges";
import type { AdminWriteContext } from "../request-guard";
import { AdminWorkspaceError } from "../workspace-service";
import { enqueueAdminDeletion } from "@/src/lib/queue";
import { deletionImpactMatches, previewDeletion } from "./impact";
import { createDeletionJob, findActiveDeletionJob, getDeletionJob, getDeletionJobByIdempotencyKey, requestDeletionCancellation, resetFailedDeletion, markDeletionEnqueueFailed } from "./repository";
import type { DeletionTarget } from "./types";

export async function queueDeletionJob(job: { id: string; version: number }) {
  const queued = await enqueueAdminDeletion(job.id).catch(() => false);
  if (!queued) {
    await markDeletionEnqueueFailed(job.id, job.version);
    throw new AdminWorkspaceError(503, "deletion_queue_unavailable");
  }
}

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
    if (existing.targetKind !== input.target.kind || existing.targetId !== input.target.id || existing.impactDigest !== input.impactDigest || existing.includeAuthUsers !== input.includeAuthUsers || existing.requestedByUserId !== input.context.owner.userId) {
      throw new AdminWorkspaceError(409, "idempotency_conflict");
    }
    await queueDeletionJob(existing);
    return existing;
  }
  // Checked before the challenge is spent so the operator can retry once the other job ends.
  if (await findActiveDeletionJob(input.target)) throw new AdminWorkspaceError(409, "deletion_already_active");
  const fresh = await previewDeletion(input.target);
  if (fresh.impactDigest !== input.impactDigest) throw new AdminWorkspaceError(409, "impact_changed");
  if (input.confirmation !== fresh.confirmationPhrase) throw new AdminWorkspaceError(422, "confirmation_mismatch");
  await consumeAdminChallenge({
    token: input.challengeToken, userId: input.context.owner.userId, sessionId: input.context.owner.sessionId,
    action: "deletion.create", targetType: input.target.kind, targetId: input.target.id,
    expectedVersion: fresh.impactDigest, confirmation: input.confirmation,
  });
  const job = await createDeletionJob({ target: input.target, preview: fresh, includeAuthUsers: input.includeAuthUsers, context: input.context });
  await queueDeletionJob(job);
  return job;
}

// A retried job that never passed VALIDATE is checked now, so a structural
// change is reported to the operator instead of failing again in the worker.
async function revalidateBeforeRetry(id: string) {
  const job = await getDeletionJob(id);
  if (!job) throw new AdminWorkspaceError(404, "deletion_job_not_found");
  if (job.targetKind === "SYNTHETIC_ACCOUNTS") return;
  if (job.stages.some((stage) => stage.stage === "VALIDATE" && stage.state === "COMPLETED")) return;
  const fresh = await previewDeletion({ kind: job.targetKind, id: job.targetId });
  if (!deletionImpactMatches(job, fresh)) throw new AdminWorkspaceError(409, "impact_changed");
}

export async function changeDeletionJob(id: string, action: "cancel" | "retry", context: AdminWriteContext) {
  if (action === "retry") await revalidateBeforeRetry(id);
  const job = action === "cancel" ? await requestDeletionCancellation(id, context.owner.userId) : await resetFailedDeletion(id);
  if (job) await queueDeletionJob(job);
  return job;
}
