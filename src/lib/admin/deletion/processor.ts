import "server-only";

import type { AdminDeletionStageKind } from "@prisma/client";
import { prisma } from "@/src/lib/prisma";
import { deleteQueuedWorkspaceEvents } from "@/src/lib/queue";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { previewDeletion } from "./impact";
import type { DeletionImpact } from "./types";

const STAGES: AdminDeletionStageKind[] = ["VALIDATE", "CANCEL_WORK", "DISCONNECT_PROVIDERS", "DELETE_TENANT_DATA", "MARK_IRREVERSIBLE", "DELETE_AUTH_USER", "FINALIZE"];

function safeCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "deletion_stage_failed";
  return message.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 80) || "DELETION_STAGE_FAILED";
}

async function completeStage(jobId: string, stage: AdminDeletionStageKind, operation: () => Promise<void>) {
  const existing = await prisma.adminDeletionStage.findUnique({ where: { jobId_stage: { jobId, stage } } });
  if (existing?.state === "COMPLETED") return;
  await prisma.adminDeletionStage.update({ where: { jobId_stage: { jobId, stage } }, data: { state: "RUNNING", attempts: { increment: 1 }, startedAt: existing?.startedAt ?? new Date(), safeErrorCode: null } });
  try {
    await operation();
    await prisma.adminDeletionStage.update({ where: { jobId_stage: { jobId, stage } }, data: { state: "COMPLETED", completedAt: new Date(), safeErrorCode: null } });
  } catch (error) {
    await prisma.adminDeletionStage.update({ where: { jobId_stage: { jobId, stage } }, data: { state: "FAILED", safeErrorCode: safeCode(error) } });
    throw error;
  }
}

async function markCancelled(jobId: string) {
  await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { state: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date(), progress: 100, version: { increment: 1 } } });
}

export async function processAdminDeletion(jobId: string): Promise<{ state: "COMPLETED" | "CANCELLED" }> {
  let job = await prisma.adminDeletionJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("deletion_job_not_found");
  if (job.state === "COMPLETED") return { state: "COMPLETED" };
  if (job.state === "CANCELLED") return { state: "CANCELLED" };
  await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { state: "RUNNING", startedAt: job.startedAt ?? new Date(), attempts: { increment: 1 }, finishedAt: null, terminalErrorCode: null } });

  const impact = job.impact as unknown as DeletionImpact;
  try {
    for (let index = 0; index < STAGES.length; index += 1) {
      const stage = STAGES[index];
      const current = await prisma.adminDeletionJob.findUnique({ where: { id: jobId } });
      if (!current) throw new Error("deletion_job_not_found");
      if (current.cancelRequestedAt && !current.irreversibleAt) {
        await markCancelled(jobId);
        return { state: "CANCELLED" };
      }
      await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { currentStage: stage, progress: Math.floor((index / STAGES.length) * 100) } });
      await completeStage(jobId, stage, async () => {
        if (stage === "VALIDATE") {
          const fresh = await previewDeletion({ kind: current.targetKind, id: current.targetId });
          if (fresh.impactDigest !== current.impactDigest) throw new Error("impact_changed");
        } else if (stage === "CANCEL_WORK" && current.targetKind === "WORKSPACE") {
          await deleteQueuedWorkspaceEvents(current.targetId);
          await prisma.workspace.update({ where: { id: current.targetId }, data: { status: "SUSPENDED", deletionScheduledAt: new Date(), version: { increment: 1 } } });
        } else if (stage === "DISCONNECT_PROVIDERS" && current.targetKind === "WORKSPACE") {
          await prisma.$transaction([
            prisma.instagramConnection.deleteMany({ where: { workspaceId: current.targetId } }),
            prisma.facebookPageConnection.deleteMany({ where: { workspaceId: current.targetId } }),
          ]);
        } else if (stage === "DELETE_TENANT_DATA") {
          if (current.targetKind === "WORKSPACE") await prisma.workspace.deleteMany({ where: { id: current.targetId } });
          else await prisma.$transaction([
            prisma.workspaceMember.deleteMany({ where: { userId: current.targetId } }),
            prisma.platformUserControl.deleteMany({ where: { userId: current.targetId } }),
          ]);
        } else if (stage === "MARK_IRREVERSIBLE") {
          await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { irreversibleAt: new Date(), version: { increment: 1 } } });
        } else if (stage === "DELETE_AUTH_USER") {
          const userIds = current.targetKind === "USER" ? [current.targetId] : current.includeAuthUsers ? impact.memberUserIds : [];
          for (const userId of userIds) {
            if (current.targetKind === "WORKSPACE" && await prisma.workspaceMember.count({ where: { userId } }) > 0) continue;
            const result = await createSupabaseAdminClient().auth.admin.deleteUser(userId, false);
            if (result.error && result.error.status !== 404) throw new Error("auth_user_delete_failed");
          }
        }
      });
    }
    await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { state: "COMPLETED", progress: 100, currentStage: "FINALIZE", finishedAt: new Date(), terminalErrorCode: null, version: { increment: 1 } } });
    return { state: "COMPLETED" };
  } catch (error) {
    await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { state: "FAILED", finishedAt: new Date(), terminalErrorCode: safeCode(error), version: { increment: 1 } } });
    throw error;
  }
}
