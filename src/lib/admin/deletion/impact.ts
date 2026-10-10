import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { AdminWorkspaceError } from "../workspace-service";
import type { DeletionImpact, DeletionPreview, DeletionStructure, DeletionTarget } from "./types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestDeletionImpact(impact: DeletionImpact): string {
  // Version 2 binds the confirmation to structure only. Live row counts move
  // with every webhook, so hashing them made a live workspace undeletable.
  const subject = impact.version === 2 && impact.structure ? { version: 2, structure: impact.structure } : impact;
  return createHash("sha256").update(canonical(subject)).digest("hex");
}

/**
 * Whether a fresh preview still describes the deletion an operator approved.
 * Jobs stored before version 2 carry a digest over counts, so they are compared
 * on their target and member identities instead of being failed forever.
 */
export function deletionImpactMatches(stored: { impact: unknown; impactDigest: string }, fresh: DeletionPreview): boolean {
  const impact = stored.impact as Partial<DeletionImpact> | null;
  if (impact?.version === 2) return stored.impactDigest === fresh.impactDigest;
  const sorted = (ids: unknown) => Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string").sort() : [];
  return impact?.target?.kind === fresh.impact.target.kind
    && impact.target.id === fresh.impact.target.id
    && canonical(sorted(impact.memberUserIds)) === canonical(sorted(fresh.impact.memberUserIds));
}

export function deletionConfirmationPhrase(target: DeletionTarget): string {
  return `DELETE ${target.kind} ${target.id}`;
}

async function previewUser(id: string): Promise<DeletionImpact> {
  if (getServerEnv().platformOwnerUserIds.includes(id.toLowerCase())) throw new AdminWorkspaceError(403, "protected_target");
  const auth = await createSupabaseAdminClient().auth.admin.getUserById(id);
  if (auth.error && auth.error.status !== 404) throw new AdminWorkspaceError(502, "auth_lookup_failed");
  if (auth.error || !auth.data.user) throw new AdminWorkspaceError(404, "user_not_found");
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: id }, select: { workspaceId: true, role: true } });
  if (memberships.some((membership) => membership.role === "OWNER")) throw new AdminWorkspaceError(409, "owner_transfer_required");
  const structure: DeletionStructure = {
    target: { kind: "USER", id },
    memberUserIds: [id],
    protected: false,
    memberships: memberships.map((membership) => `${membership.workspaceId}:${membership.role}`).sort(),
  };
  return {
    version: 2,
    structure,
    target: { kind: "USER", id },
    identity: { label: auth.data.user.email ?? id },
    counts: { memberships: memberships.length, platformControls: await prisma.platformUserControl.count({ where: { userId: id } }) },
    memberUserIds: [id],
    warnings: ["The Supabase Auth user will be permanently removed after Linkar data cleanup."],
  };
}

async function previewWorkspace(id: string): Promise<DeletionImpact> {
  return prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.findUnique({ where: { id }, select: { name: true, status: true, deletionScheduledAt: true } });
    if (!workspace) throw new AdminWorkspaceError(404, "workspace_not_found");
    // Suspended workspaces are the usual deletion candidates. A workspace already
    // locked by a deletion job belongs to that job. The processor re-runs this
    // preview only while VALIDATE is incomplete, which is before CANCEL_WORK
    // suspends and locks the workspace, so the recorded status stays stable.
    if (workspace.deletionScheduledAt || workspace.status === "DELETION_PENDING") throw new AdminWorkspaceError(409, "deletion_in_progress");
    if (workspace.status !== "ACTIVE" && workspace.status !== "SUSPENDED") throw new AdminWorkspaceError(409, "workspace_not_deletable");
    const members = await transaction.workspaceMember.findMany({ where: { workspaceId: id }, select: { userId: true } });
    const userIds = members.flatMap((member) => member.userId ? [member.userId] : []).sort();
    if (userIds.some((userId) => getServerEnv().platformOwnerUserIds.includes(userId.toLowerCase()))) {
      throw new AdminWorkspaceError(403, "protected_target");
    }
    const [automations, contacts, participants, executions, webhookEvents, deliveries, integrations, sequences, broadcasts, trackedLinks] = await Promise.all([
      transaction.automation.count({ where: { workspaceId: id } }),
      transaction.automationContact.count({ where: { workspaceId: id } }),
      transaction.automationParticipant.count({ where: { workspaceId: id } }),
      transaction.automationExecution.count({ where: { workspaceId: id } }),
      transaction.webhookEvent.count({ where: { workspaceId: id } }),
      transaction.outboundDelivery.count({ where: { workspaceId: id } }),
      Promise.all([transaction.instagramConnection.count({ where: { workspaceId: id } }), transaction.facebookPageConnection.count({ where: { workspaceId: id } })]).then(([a, b]) => a + b),
      transaction.automationSequence.count({ where: { workspaceId: id } }),
      transaction.broadcast.count({ where: { workspaceId: id } }),
      transaction.trackedLink.count({ where: { workspaceId: id } }),
    ]);
    return {
      version: 2,
      structure: { target: { kind: "WORKSPACE", id }, memberUserIds: userIds, protected: false, workspaceStatus: workspace.status },
      target: { kind: "WORKSPACE", id },
      identity: { label: workspace.name },
      counts: { members: members.length, automations, contacts, participants, executions, webhookEvents, deliveries, integrations, sequences, broadcasts, trackedLinks },
      memberUserIds: userIds,
      warnings: ["All workspace-owned data and connected-provider state will be permanently removed."],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function previewDeletion(target: DeletionTarget): Promise<DeletionPreview> {
  if (target.kind === "SYNTHETIC_ACCOUNTS") throw new AdminWorkspaceError(422, "unsupported_deletion_target");
  const impact = target.kind === "USER" ? await previewUser(target.id) : await previewWorkspace(target.id);
  return { impact, impactDigest: digestDeletionImpact(impact), confirmationPhrase: deletionConfirmationPhrase(target) };
}
