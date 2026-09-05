import "server-only";

import { consumeAdminChallenge, createAdminChallenge } from "../challenges";
import { AdminWorkspaceError } from "../workspace-service";
import { enqueueAdminDeletion } from "@/src/lib/queue";
import { loadSyntheticAccountInventory } from "./synthetic-inventory";
import { createDeletionJob, getDeletionJobByIdempotencyKey } from "./repository";
import type { AdminWriteContext } from "../request-guard";
import type { DeletionPreview } from "./types";

export const SYNTHETIC_CLEANUP_TARGET = {
  type: "SYNTHETIC_ACCOUNTS",
  id: "approved-test-patterns",
} as const;

export function syntheticCleanupConfirmationPhrase(count: number): string {
  return `DELETE ${count} SYNTHETIC ACCOUNTS`;
}

export async function prepareSyntheticAccountCleanup(actor: { userId: string; sessionId: string }) {
  const inventory = await loadSyntheticAccountInventory();
  if (inventory.unsafeOwnedWorkspaceCount > 0) {
    throw new AdminWorkspaceError(409, "shared_test_workspace_requires_review");
  }
  const confirmationPhrase = syntheticCleanupConfirmationPhrase(inventory.count);
  const challenge = await createAdminChallenge({
    userId: actor.userId,
    sessionId: actor.sessionId,
    action: "synthetic_cleanup.create",
    targetType: SYNTHETIC_CLEANUP_TARGET.type,
    targetId: SYNTHETIC_CLEANUP_TARGET.id,
    expectedVersion: inventory.digest,
    confirmation: confirmationPhrase,
  });

  return {
    count: inventory.count,
    membershipsAffected: inventory.membershipCount,
    ownedWorkspacesAffected: inventory.ownedWorkspaceCount,
    protectedAccountsExcluded: inventory.excludedProtectedCount,
    digest: inventory.digest,
    confirmationPhrase,
    challenge,
  };
}

function previewFromInventory(inventory: Awaited<ReturnType<typeof loadSyntheticAccountInventory>>): DeletionPreview {
  return {
    impactDigest: inventory.digest,
    confirmationPhrase: syntheticCleanupConfirmationPhrase(inventory.count),
    impact: {
      version: 1,
      target: { kind: "SYNTHETIC_ACCOUNTS", id: SYNTHETIC_CLEANUP_TARGET.id },
      identity: { label: `${inventory.count} approved synthetic accounts` },
      counts: {
        accounts: inventory.count,
        memberships: inventory.membershipCount,
        ownedWorkspaces: inventory.ownedWorkspaceCount,
      },
      memberUserIds: inventory.accounts.map((account) => account.userId),
      syntheticAccounts: inventory.accounts,
      warnings: [
        "Only accounts matching Linkar's three fixed generated-test email patterns are included.",
        "Owned workspaces are removed before the remaining Auth identities.",
      ],
    },
  };
}

export async function requestSyntheticAccountCleanup(input: {
  impactDigest: string;
  confirmation: string;
  challengeToken: string;
  context: AdminWriteContext;
}) {
  const existing = await getDeletionJobByIdempotencyKey(input.context.idempotencyKey);
  if (existing) {
    if (existing.targetKind !== "SYNTHETIC_ACCOUNTS" || existing.impactDigest !== input.impactDigest) {
      throw new AdminWorkspaceError(409, "idempotency_conflict");
    }
    if (!await enqueueAdminDeletion(existing.id)) throw new AdminWorkspaceError(503, "deletion_queue_unavailable");
    return existing;
  }

  const inventory = await loadSyntheticAccountInventory();
  if (inventory.unsafeOwnedWorkspaceCount > 0) {
    throw new AdminWorkspaceError(409, "shared_test_workspace_requires_review");
  }
  if (inventory.digest !== input.impactDigest) throw new AdminWorkspaceError(409, "impact_changed");
  const preview = previewFromInventory(inventory);
  if (input.confirmation !== preview.confirmationPhrase) {
    throw new AdminWorkspaceError(422, "confirmation_mismatch");
  }
  await consumeAdminChallenge({
    token: input.challengeToken,
    userId: input.context.owner.userId,
    sessionId: input.context.owner.sessionId,
    action: "synthetic_cleanup.create",
    targetType: SYNTHETIC_CLEANUP_TARGET.type,
    targetId: SYNTHETIC_CLEANUP_TARGET.id,
    expectedVersion: inventory.digest,
    confirmation: input.confirmation,
  });
  const job = await createDeletionJob({
    target: preview.impact.target,
    preview,
    includeAuthUsers: true,
    context: input.context,
  });
  if (!await enqueueAdminDeletion(job.id)) throw new AdminWorkspaceError(503, "deletion_queue_unavailable");
  return job;
}
