import "server-only";

import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import type { MemberRole } from "@/src/lib/repository";

export class AdminWorkspaceError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "AdminWorkspaceError";
  }
}

function slugValue(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(slug)) {
    throw new AdminWorkspaceError(422, "invalid_slug");
  }
  return slug;
}

async function targetUser(userId: string) {
  const result = await createSupabaseAdminClient().auth.admin.getUserById(userId);
  if (result.error || !result.data.user?.email) throw new AdminWorkspaceError(404, "user_not_found");
  return { id: result.data.user.id, email: result.data.user.email.toLowerCase() };
}

function translateConflict(error: unknown): never {
  if ((error as { code?: string }).code === "P2002") throw new AdminWorkspaceError(409, "slug_conflict");
  throw error;
}

export async function createAdminWorkspace(input: { name: string; slug: string; ownerUserId: string }) {
  const name = input.name.trim();
  if (!name || name.length > 120) throw new AdminWorkspaceError(422, "invalid_name");
  const slug = slugValue(input.slug);
  const owner = await targetUser(input.ownerUserId);
  try {
    return await prisma.workspace.create({
      data: {
        id: createId("workspace"),
        name,
        slug,
        members: { create: { id: createId("member"), userId: owner.id, email: owner.email, role: "OWNER" } },
        entitlement: { create: { plan: { connect: { key: "free" } } } },
      },
      select: { id: true, name: true, slug: true, status: true, version: true, createdAt: true, updatedAt: true },
    });
  } catch (error) {
    return translateConflict(error);
  }
}

export async function updateAdminWorkspace(workspaceId: string, input: { name?: string; slug?: string; version: number }) {
  const data: { name?: string; slug?: string; version: { increment: number } } = { version: { increment: 1 } };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name || name.length > 120) throw new AdminWorkspaceError(422, "invalid_name");
    data.name = name;
  }
  if (input.slug !== undefined) data.slug = slugValue(input.slug);
  try {
    const changed = await prisma.workspace.updateMany({ where: { id: workspaceId, version: input.version }, data });
    if (changed.count !== 1) {
      const exists = await prisma.workspace.count({ where: { id: workspaceId } });
      throw new AdminWorkspaceError(exists ? 409 : 404, exists ? "stale_version" : "workspace_not_found");
    }
    return prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { id: true, name: true, slug: true, status: true, version: true, createdAt: true, updatedAt: true },
    });
  } catch (error) {
    if (error instanceof AdminWorkspaceError) throw error;
    return translateConflict(error);
  }
}

async function protectPlatformOwner(userId: string | null | undefined): Promise<void> {
  if (userId && getServerEnv().platformOwnerUserIds.includes(userId.toLowerCase())) {
    throw new AdminWorkspaceError(403, "platform_owner_protected");
  }
}

export async function changeAdminWorkspaceMember(workspaceId: string, input: {
  action: "ADD" | "CHANGE_ROLE" | "TRANSFER_OWNERSHIP";
  userId: string;
  role?: Exclude<MemberRole, "OWNER">;
}) {
  const user = await targetUser(input.userId);
  if (input.action === "ADD") {
    if (!input.role) throw new AdminWorkspaceError(422, "role_required");
    try {
      return await prisma.workspaceMember.create({
        data: { id: createId("member"), workspaceId, userId: user.id, email: user.email, role: input.role },
        select: { userId: true, email: true, role: true },
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new AdminWorkspaceError(409, "member_exists");
      throw error;
    }
  }

  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: user.id } });
  if (!member) throw new AdminWorkspaceError(404, "member_not_found");
  if (input.action === "CHANGE_ROLE") {
    if (member.role === "OWNER") throw new AdminWorkspaceError(409, "owner_transfer_required");
    if (!input.role) throw new AdminWorkspaceError(422, "role_required");
    return prisma.workspaceMember.update({ where: { id: member.id }, data: { role: input.role }, select: { userId: true, email: true, role: true } });
  }

  return prisma.$transaction(async (transaction) => {
    const currentOwner = await transaction.workspaceMember.findFirst({ where: { workspaceId, role: "OWNER" } });
    if (!currentOwner) throw new AdminWorkspaceError(409, "workspace_owner_missing");
    await protectPlatformOwner(currentOwner.userId);
    if (currentOwner.id === member.id) return { userId: member.userId, email: member.email, role: member.role };
    await transaction.workspaceMember.update({ where: { id: currentOwner.id }, data: { role: "ADMIN" } });
    return transaction.workspaceMember.update({ where: { id: member.id }, data: { role: "OWNER" }, select: { userId: true, email: true, role: true } });
  });
}

export async function removeAdminWorkspaceMember(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId } });
  if (!member) throw new AdminWorkspaceError(404, "member_not_found");
  await protectPlatformOwner(member.userId);
  if (member.role === "OWNER") throw new AdminWorkspaceError(409, "owner_transfer_required");
  await prisma.workspaceMember.delete({ where: { id: member.id } });
  return { removed: true, userId };
}

export async function setAdminWorkspaceLifecycle(workspaceId: string, input: {
  action: "SUSPEND" | "RESTORE";
  version: number;
  reason: string;
  actorUserId: string;
}) {
  if (input.action === "SUSPEND") {
    const protectedMember = await prisma.workspaceMember.findFirst({
      where: { workspaceId, userId: { in: getServerEnv().platformOwnerUserIds } },
      select: { userId: true },
    });
    await protectPlatformOwner(protectedMember?.userId);
  }
  const status = input.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
  const changed = await prisma.workspace.updateMany({
    where: { id: workspaceId, version: input.version },
    data: {
      status,
      version: { increment: 1 },
      suspendedAt: status === "SUSPENDED" ? new Date() : null,
      suspendedReason: status === "SUSPENDED" ? input.reason : null,
      suspendedByUserId: status === "SUSPENDED" ? input.actorUserId : null,
    },
  });
  if (changed.count !== 1) {
    const exists = await prisma.workspace.count({ where: { id: workspaceId } });
    throw new AdminWorkspaceError(exists ? 409 : 404, exists ? "stale_version" : "workspace_not_found");
  }
  return prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { id: true, status: true, version: true, updatedAt: true } });
}

export async function pauseAdminWorkspaceAutomations(workspaceId: string, version: number) {
  return prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.updateMany({
      where: { id: workspaceId, version },
      data: { version: { increment: 1 } },
    });
    if (workspace.count !== 1) throw new AdminWorkspaceError(409, "stale_version");
    const paused = await transaction.automation.updateMany({
      where: { workspaceId, status: "ACTIVE" },
      data: { status: "PAUSED" },
    });
    return { paused: paused.count, version: version + 1 };
  });
}

function formulaSafe(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

export async function loadSafeWorkspaceExport(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true,
      members: { select: { userId: true, email: true, role: true } },
      automations: { select: { id: true, name: true, status: true, createdAt: true, updatedAt: true } },
      contacts: { select: { id: true, email: true, leadStatus: true, tags: true, createdAt: true, updatedAt: true } },
    },
  });
  if (!workspace) throw new AdminWorkspaceError(404, "workspace_not_found");
  return workspace;
}

export function workspaceExportCsv(data: Awaited<ReturnType<typeof loadSafeWorkspaceExport>>): string {
  const rows = [["type", "id", "name_or_email", "status_or_role", "created_at"]];
  rows.push(["workspace", data.id, data.name, data.status, data.createdAt.toISOString()]);
  for (const member of data.members) rows.push(["member", member.userId ?? "", member.email, member.role, ""]);
  for (const automation of data.automations) rows.push(["automation", automation.id, automation.name, automation.status, automation.createdAt.toISOString()]);
  for (const contact of data.contacts) rows.push(["contact", contact.id, contact.email ?? "", contact.leadStatus, contact.createdAt.toISOString()]);
  return `${rows.map((row) => row.map(formulaSafe).join(",")).join("\n")}\n`;
}
