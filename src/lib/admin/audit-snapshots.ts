import "server-only";

import { prisma } from "@/src/lib/prisma";
import { getAdminAccountsRepository } from "./accounts-provider";

// Read just before an audited command so its audit rows record what the
// command replaced. A missing record yields null; the command then reports
// its own not-found error.

export async function planAuditSnapshot(planId: string) {
  return prisma.planDefinition.findUnique({
    where: { id: planId },
    select: {
      key: true, name: true, isActive: true, version: true,
      memberLimit: true, automationLimit: true, instagramConnectionLimit: true,
      facebookConnectionLimit: true, sequenceLimit: true, monthlyBroadcastLimit: true,
      monthlyDeliveryLimit: true, sequencesEnabled: true, broadcastsEnabled: true,
      trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: true,
    },
  });
}

export async function entitlementAuditSnapshot(workspaceId: string) {
  return prisma.workspaceEntitlement.findUnique({
    where: { workspaceId },
    select: { planId: true, overrides: true, version: true },
  });
}

export async function workspaceAuditSnapshot(workspaceId: string) {
  return prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, slug: true, status: true, version: true, suspendedReason: true, deletionScheduledAt: true },
  });
}

export async function membershipAuditSnapshot(workspaceId: string, userId: string) {
  const [member, owner] = await Promise.all([
    prisma.workspaceMember.findFirst({ where: { workspaceId, userId }, select: { userId: true, email: true, role: true } }),
    prisma.workspaceMember.findFirst({ where: { workspaceId, role: "OWNER" }, select: { userId: true } }),
  ]);
  return { member, ownerUserId: owner?.userId ?? null };
}

export async function userAuditSnapshot(userId: string) {
  const user = await getAdminAccountsRepository().getAdminUser(userId);
  if (!user) return null;
  return {
    email: user.email,
    status: user.status,
    authBannedUntil: user.authBannedUntil ?? null,
    sessionInvalidBefore: user.sessionInvalidBefore ?? null,
    suspendedReason: user.suspendedReason ?? null,
  };
}
