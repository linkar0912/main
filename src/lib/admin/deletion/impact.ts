import "server-only";

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { AdminWorkspaceError } from "../workspace-service";
import type { DeletionImpact, DeletionPreview, DeletionTarget } from "./types";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestDeletionImpact(impact: DeletionImpact): string {
  return createHash("sha256").update(canonical(impact)).digest("hex");
}

export function deletionConfirmationPhrase(target: DeletionTarget): string {
  return `DELETE ${target.kind} ${target.id}`;
}

async function previewUser(id: string): Promise<DeletionImpact> {
  if (getServerEnv().platformOwnerUserIds.includes(id.toLowerCase())) throw new AdminWorkspaceError(403, "protected_target");
  const auth = await createSupabaseAdminClient().auth.admin.getUserById(id);
  if (auth.error || !auth.data.user) throw new AdminWorkspaceError(404, "user_not_found");
  const memberships = await prisma.workspaceMember.findMany({ where: { userId: id }, select: { workspaceId: true, role: true } });
  if (memberships.some((membership) => membership.role === "OWNER")) throw new AdminWorkspaceError(409, "owner_transfer_required");
  return {
    version: 1,
    target: { kind: "USER", id },
    identity: { label: auth.data.user.email ?? id },
    counts: { memberships: memberships.length, platformControls: await prisma.platformUserControl.count({ where: { userId: id } }) },
    memberUserIds: [id],
    warnings: ["The Supabase Auth user will be permanently removed after Linkar data cleanup."],
  };
}

async function previewWorkspace(id: string): Promise<DeletionImpact> {
  return prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.findUnique({ where: { id }, select: { name: true } });
    if (!workspace) throw new AdminWorkspaceError(404, "workspace_not_found");
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
      version: 1,
      target: { kind: "WORKSPACE", id },
      identity: { label: workspace.name },
      counts: { members: members.length, automations, contacts, participants, executions, webhookEvents, deliveries, integrations, sequences, broadcasts, trackedLinks },
      memberUserIds: userIds,
      warnings: ["All workspace-owned data and connected-provider state will be permanently removed."],
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function previewDeletion(target: DeletionTarget): Promise<DeletionPreview> {
  const impact = target.kind === "USER" ? await previewUser(target.id) : await previewWorkspace(target.id);
  return { impact, impactDigest: digestDeletionImpact(impact), confirmationPhrase: deletionConfirmationPhrase(target) };
}
