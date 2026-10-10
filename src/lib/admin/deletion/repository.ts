import "server-only";

import type { AdminDeletionJobState, AdminDeletionStageKind, Prisma } from "@prisma/client";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import { decodeAdminCursor, encodeAdminCursor } from "../cursor";
import type { AdminWriteContext } from "../request-guard";
import type { DeletionPreview, DeletionTarget } from "./types";

const STAGES: AdminDeletionStageKind[] = ["VALIDATE", "CANCEL_WORK", "DISCONNECT_PROVIDERS", "MARK_IRREVERSIBLE", "DELETE_TENANT_DATA", "DELETE_AUTH_USER", "FINALIZE"];

export const activeDeletionStates: AdminDeletionJobState[] = ["QUEUED", "RUNNING", "CANCELLING"];
const DELETION_PAGE_SIZE = 25;

function deletionAlreadyActive(): Error {
  return Object.assign(new Error("deletion_already_active"), { status: 409, code: "deletion_already_active" });
}

// AdminDeletionJob_active_target_key (a partial unique index) allows one active
// job per target; a concurrent request loses the race with P2002.
function translateActiveConflict(error: unknown): never {
  if ((error as { code?: string }).code === "P2002") throw deletionAlreadyActive();
  throw error;
}

export async function findActiveDeletionJob(target: Pick<DeletionTarget, "kind" | "id">, excludeJobId?: string) {
  return prisma.adminDeletionJob.findFirst({
    where: { targetKind: target.kind, targetId: target.id, state: { in: activeDeletionStates }, ...(excludeJobId ? { id: { not: excludeJobId } } : {}) },
    select: { id: true, state: true },
  });
}

export async function createDeletionJob(input: { target: DeletionTarget; preview: DeletionPreview; includeAuthUsers: boolean; context: AdminWriteContext }) {
  return prisma.adminDeletionJob.create({
    data: {
      id: createId("del"), targetKind: input.target.kind, targetId: input.target.id,
      impact: input.preview.impact as unknown as Prisma.InputJsonValue,
      impactVersion: input.preview.impact.version, impactDigest: input.preview.impactDigest,
      requestedByUserId: input.context.owner.userId, requestedByEmail: input.context.owner.email,
      reason: input.context.reason, idempotencyKey: input.context.idempotencyKey,
      includeAuthUsers: input.includeAuthUsers,
      stages: { create: STAGES.map((stage) => ({ stage })) },
    },
    include: { stages: { orderBy: { updatedAt: "asc" } } },
  }).catch(translateActiveConflict);
}

export async function listDeletionJobs(input: { cursor?: string | null; limit?: number } = {}, secret = getServerEnv().authSessionSecret) {
  const limit = Math.min(100, Math.max(1, input.limit ?? DELETION_PAGE_SIZE));
  const cursor = input.cursor ? decodeAdminCursor(input.cursor, secret) : null;
  const at = cursor ? new Date(cursor.createdAt) : null;
  const rows = await prisma.adminDeletionJob.findMany({
    where: cursor && at ? { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: cursor.id } }] } : undefined,
    take: limit + 1,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { stages: true },
  });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeAdminCursor({ id: last.id, createdAt: last.createdAt.toISOString() }, secret) : null };
}

export async function getDeletionJob(id: string) {
  return prisma.adminDeletionJob.findUnique({ where: { id }, include: { stages: true } });
}

export async function getDeletionJobByIdempotencyKey(idempotencyKey: string) {
  return prisma.adminDeletionJob.findUnique({ where: { idempotencyKey }, include: { stages: true } });
}

export async function requestDeletionCancellation(id: string, actorUserId: string) {
  const updated = await prisma.adminDeletionJob.updateMany({
    where: { id, state: { in: ["QUEUED", "RUNNING", "FAILED", "CANCELLING"] }, irreversibleAt: null },
    data: { state: "CANCELLING", cancelRequestedAt: new Date(), cancelledByUserId: actorUserId, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw Object.assign(new Error("irreversible"), { status: 409, code: "irreversible" });
  return getDeletionJob(id);
}

export async function resetFailedDeletion(id: string) {
  const job = await prisma.adminDeletionJob.findUnique({ where: { id }, select: { targetKind: true, targetId: true } });
  if (job && await findActiveDeletionJob({ kind: job.targetKind, id: job.targetId }, id)) throw deletionAlreadyActive();
  const updated = await prisma.adminDeletionJob.updateMany({ where: { id, state: "FAILED" }, data: { state: "QUEUED", terminalErrorCode: null, finishedAt: null, version: { increment: 1 } } }).catch(translateActiveConflict);
  if (updated.count !== 1) throw Object.assign(new Error("job_not_retryable"), { status: 409, code: "job_not_retryable" });
  return getDeletionJob(id);
}

export async function markDeletionEnqueueFailed(id: string, version: number) {
  await prisma.adminDeletionJob.updateMany({
    where: { id, version, state: "QUEUED" },
    data: { state: "FAILED", terminalErrorCode: "DELETION_QUEUE_UNAVAILABLE", finishedAt: new Date(), version: { increment: 1 } },
  });
}

