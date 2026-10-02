import "server-only";

import type { AdminDeletionStageKind } from "@prisma/client";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { deleteQueuedWorkspaceEventsBatch } from "@/src/lib/queue";
import { getRepository } from "@/src/lib/repository-provider";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { previewDeletion } from "./impact";
import type { DeletionImpact } from "./types";
import { loadSyntheticAccountInventory } from "./synthetic-inventory";
import { assertSyntheticCleanupInventory, canDeleteSyntheticAuthUser } from "./synthetic-cleanup-safety";

const STAGES: AdminDeletionStageKind[] = ["VALIDATE", "CANCEL_WORK", "DISCONNECT_PROVIDERS", "MARK_IRREVERSIBLE", "DELETE_TENANT_DATA", "DELETE_AUTH_USER", "FINALIZE"];

function safeCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  const codes = ["deletion_job_not_found", "synthetic_inventory_missing", "impact_changed", "workspace_not_found", "protected_target", "owner_transfer_required", "synthetic_identity_missing", "auth_user_lookup_failed", "auth_identity_changed", "auth_user_delete_failed", "synthetic_inventory_changed", "shared_test_workspace_requires_review"];
  return codes.includes(message) ? message.toUpperCase() : "DELETION_STAGE_FAILED";
}

class DeletionCancelled extends Error {}

async function completeStage(jobId: string, stage: AdminDeletionStageKind, operation: () => Promise<void>) {
  const existing = await prisma.adminDeletionStage.findUnique({ where: { jobId_stage: { jobId, stage } } });
  if (existing?.state === "COMPLETED") return;
  await prisma.adminDeletionStage.update({ where: { jobId_stage: { jobId, stage } }, data: { state: "RUNNING", attempts: { increment: 1 }, startedAt: existing?.startedAt ?? new Date(), safeErrorCode: null } });
  try {
    await operation();
    await prisma.adminDeletionStage.update({ where: { jobId_stage: { jobId, stage } }, data: { state: "COMPLETED", completedAt: new Date(), safeErrorCode: null } });
  } catch (error) {
    await prisma.adminDeletionStage.update({ where: { jobId_stage: { jobId, stage } }, data: { state: error instanceof DeletionCancelled ? "PENDING" : "FAILED", safeErrorCode: error instanceof DeletionCancelled ? null : safeCode(error) } });
    throw error;
  }
}

function syntheticWorkspaceIds(impact: DeletionImpact): string[] {
  return [...new Set((impact.syntheticAccounts ?? []).flatMap((account) => account.ownedWorkspaceIds))];
}

async function markCancelled(jobId: string, targetKind: "USER" | "WORKSPACE" | "SYNTHETIC_ACCOUNTS", targetId: string, impact: DeletionImpact) {
  if (targetKind === "WORKSPACE") {
    await prisma.workspace.updateMany({ where: { id: targetId, deletionScheduledAt: { not: null } }, data: { status: "ACTIVE", deletionScheduledAt: null, version: { increment: 1 } } });
  } else if (targetKind === "SYNTHETIC_ACCOUNTS") {
    await prisma.workspace.updateMany({
      where: { id: { in: syntheticWorkspaceIds(impact) }, deletionScheduledAt: { not: null } },
      data: { status: "ACTIVE", deletionScheduledAt: null, version: { increment: 1 } },
    });
  }
  await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { state: "CANCELLED", cancelledAt: new Date(), finishedAt: new Date(), progress: 100, version: { increment: 1 } } });
}

export async function processAdminDeletion(jobId: string): Promise<{ state: "COMPLETED" | "CANCELLED" }> {
  const job = await prisma.adminDeletionJob.findUnique({ where: { id: jobId } });
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
        await markCancelled(jobId, current.targetKind, current.targetId, impact);
        return { state: "CANCELLED" };
      }
      await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { currentStage: stage, progress: Math.floor((index / STAGES.length) * 100) } });
      await completeStage(jobId, stage, async () => {
        if (stage === "VALIDATE") {
          if (current.targetKind === "SYNTHETIC_ACCOUNTS") {
            if (!impact.syntheticAccounts?.length) throw new Error("synthetic_inventory_missing");
            assertSyntheticCleanupInventory(current.impactDigest, await loadSyntheticAccountInventory());
          } else {
            const fresh = await previewDeletion({ kind: current.targetKind, id: current.targetId });
            if (fresh.impactDigest !== current.impactDigest) throw new Error("impact_changed");
          }
        } else if (stage === "CANCEL_WORK" && current.targetKind !== "USER") {
          const workspaceIds = current.targetKind === "WORKSPACE" ? [current.targetId] : syntheticWorkspaceIds(impact);
          const repository = getRepository();
          const providerIds = (await Promise.all(workspaceIds.map(async (workspaceId) => {
            const [connections, pages] = await Promise.all([
              repository.listConnections(workspaceId),
              repository.listFacebookPages(workspaceId),
            ]);
            return [...connections.map((connection) => connection.igUserId), ...pages.map((page) => page.pageId)];
          }))).flat();
          await prisma.workspace.updateMany({
            where: { id: { in: workspaceIds }, status: "ACTIVE" },
            data: { status: "SUSPENDED", deletionScheduledAt: new Date(), version: { increment: 1 } },
          });
          await deleteQueuedWorkspaceEventsBatch([...workspaceIds, ...providerIds]);
        } else if (stage === "DISCONNECT_PROVIDERS" && current.targetKind === "WORKSPACE") {
          // The suspended workspace cannot dispatch. Provider credentials remain
          // intact until the irreversible boundary so cancellation is honest.
          await prisma.workspace.findUniqueOrThrow({ where: { id: current.targetId }, select: { id: true } });
        } else if (stage === "DELETE_TENANT_DATA") {
          if (current.targetKind === "WORKSPACE") await prisma.workspace.deleteMany({ where: { id: current.targetId } });
          else if (current.targetKind === "SYNTHETIC_ACCOUNTS") {
            const userIds = impact.syntheticAccounts?.map((account) => account.userId) ?? [];
            await prisma.$transaction([
              prisma.workspace.deleteMany({ where: { id: { in: syntheticWorkspaceIds(impact) } } }),
              prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } }),
              prisma.platformUserControl.deleteMany({ where: { userId: { in: userIds } } }),
            ]);
          }
          else await prisma.$transaction([
            prisma.workspaceMember.deleteMany({ where: { userId: current.targetId } }),
            prisma.platformUserControl.deleteMany({ where: { userId: current.targetId } }),
          ]);
        } else if (stage === "MARK_IRREVERSIBLE") {
          if (current.targetKind === "SYNTHETIC_ACCOUNTS") {
            assertSyntheticCleanupInventory(current.impactDigest, await loadSyntheticAccountInventory());
          } else if (current.targetKind === "USER") {
            if (getServerEnv().platformOwnerUserIds.includes(current.targetId.toLowerCase())) throw new Error("protected_target");
            if (await prisma.workspaceMember.count({ where: { userId: current.targetId, role: "OWNER" } })) throw new Error("owner_transfer_required");
          } else {
            if (await prisma.workspaceMember.count({ where: { workspaceId: current.targetId, userId: { in: getServerEnv().platformOwnerUserIds } } })) throw new Error("protected_target");
          }
          if (!current.irreversibleAt) {
            // Cancellation and the irreversible boundary compete on the same row.
            // Once cancellation wins, no destructive stage may start.
            const marked = await prisma.adminDeletionJob.updateMany({
              where: { id: jobId, irreversibleAt: null, cancelRequestedAt: null },
              data: { irreversibleAt: new Date(), version: { increment: 1 } },
            });
            if (marked.count !== 1) {
              const latest = await prisma.adminDeletionJob.findUnique({ where: { id: jobId } });
              if (latest?.cancelRequestedAt && !latest.irreversibleAt) throw new DeletionCancelled();
              if (!latest?.irreversibleAt) throw new Error("deletion_job_not_found");
            }
          }
        } else if (stage === "DELETE_AUTH_USER") {
          const storedAccounts = current.targetKind === "SYNTHETIC_ACCOUNTS" ? impact.syntheticAccounts ?? [] : [];
          const userIds = current.targetKind === "USER" ? [current.targetId] : current.includeAuthUsers ? impact.memberUserIds : [];
          for (const userId of userIds) {
            if (current.targetKind === "WORKSPACE" && await prisma.workspaceMember.count({ where: { userId } }) > 0) continue;
            const supabase = createSupabaseAdminClient();
            if (current.targetKind === "SYNTHETIC_ACCOUNTS") {
              const stored = storedAccounts.find((account) => account.userId === userId);
              if (!stored) throw new Error("synthetic_identity_missing");
              const lookup = await supabase.auth.admin.getUserById(userId);
              if (lookup.error?.status === 404) continue;
              if (lookup.error || !lookup.data.user) throw new Error("auth_user_lookup_failed");
              if (!canDeleteSyntheticAuthUser(stored, lookup.data.user, getServerEnv().platformOwnerUserIds)) {
                throw new Error("auth_identity_changed");
              }
            }
            const result = await supabase.auth.admin.deleteUser(userId, false);
            if (result.error && result.error.status !== 404) throw new Error("auth_user_delete_failed");
          }
        }
      });
    }
    await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { state: "COMPLETED", progress: 100, currentStage: "FINALIZE", finishedAt: new Date(), terminalErrorCode: null, version: { increment: 1 } } });
    return { state: "COMPLETED" };
  } catch (error) {
    if (error instanceof DeletionCancelled) {
      await markCancelled(jobId, job.targetKind, job.targetId, impact);
      return { state: "CANCELLED" };
    }
    await prisma.adminDeletionJob.update({ where: { id: jobId }, data: { state: "FAILED", finishedAt: new Date(), terminalErrorCode: safeCode(error), version: { increment: 1 } } });
    throw error;
  }
}
