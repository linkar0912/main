import "server-only";

import type { AdminDeletionJobState, AdminDeletionStageKind, Prisma } from "@prisma/client";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import type { AdminWriteContext } from "../request-guard";
import type { DeletionPreview, DeletionTarget } from "./types";

const STAGES: AdminDeletionStageKind[] = ["VALIDATE", "CANCEL_WORK", "DISCONNECT_PROVIDERS", "MARK_IRREVERSIBLE", "DELETE_TENANT_DATA", "DELETE_AUTH_USER", "FINALIZE"];

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
  });
}

export async function listDeletionJobs(limit = 50) {
  return prisma.adminDeletionJob.findMany({ take: Math.min(100, Math.max(1, limit)), orderBy: [{ createdAt: "desc" }, { id: "desc" }], include: { stages: true } });
}

export async function getDeletionJob(id: string) {
  return prisma.adminDeletionJob.findUnique({ where: { id }, include: { stages: true } });
}

export async function getDeletionJobByIdempotencyKey(idempotencyKey: string) {
  return prisma.adminDeletionJob.findUnique({ where: { idempotencyKey }, include: { stages: true } });
}

export async function requestDeletionCancellation(id: string, actorUserId: string) {
  const updated = await prisma.adminDeletionJob.updateMany({
    where: { id, state: { in: ["QUEUED", "RUNNING"] }, irreversibleAt: null },
    data: { state: "CANCELLING", cancelRequestedAt: new Date(), cancelledByUserId: actorUserId, version: { increment: 1 } },
  });
  if (updated.count !== 1) throw Object.assign(new Error("irreversible"), { status: 409, code: "irreversible" });
  return getDeletionJob(id);
}

export async function resetFailedDeletion(id: string) {
  const updated = await prisma.adminDeletionJob.updateMany({ where: { id, state: "FAILED" }, data: { state: "QUEUED", terminalErrorCode: null, finishedAt: null, version: { increment: 1 } } });
  if (updated.count !== 1) throw Object.assign(new Error("job_not_retryable"), { status: 409, code: "job_not_retryable" });
  return getDeletionJob(id);
}

export const activeDeletionStates: AdminDeletionJobState[] = ["QUEUED", "RUNNING", "CANCELLING"];
