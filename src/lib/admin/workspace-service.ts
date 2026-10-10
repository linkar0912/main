import "server-only";

import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import { Prisma } from "@prisma/client";
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
  if (result.error && result.error.status !== 404) throw new AdminWorkspaceError(502, "auth_provider_unavailable");
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

function protectPlatformOwner(userId: string | null | undefined): void {
  if (userId && getServerEnv().platformOwnerUserIds.includes(userId.toLowerCase())) {
    throw new AdminWorkspaceError(403, "platform_owner_protected");
  }
}

/** Rejects any admin command that targets an allowlisted platform owner. */
export function assertUserTargetAllowed(userId: string): void {
  protectPlatformOwner(userId);
}

type MembershipClient = Pick<Prisma.TransactionClient, "workspace" | "workspaceMember">;

/**
 * Shared guard for every admin membership command, whether it arrives from the
 * workspace page or the user page: the workspace must exist and must not be
 * queued for deletion, and a platform owner's membership is never changed.
 */
export async function assertMembershipChangeAllowed(client: MembershipClient, workspaceId: string, userId: string): Promise<void> {
  protectPlatformOwner(userId);
  const workspace = await client.workspace.findUnique({ where: { id: workspaceId }, select: { status: true, deletionScheduledAt: true } });
  if (!workspace) throw new AdminWorkspaceError(404, "workspace_not_found");
  if (workspace.deletionScheduledAt || workspace.status === "DELETION_PENDING") throw new AdminWorkspaceError(409, "deletion_in_progress");
}

function translateMembershipConflict(error: unknown): never {
  const code = (error as { code?: string }).code;
  if (code === "P2002") throw new AdminWorkspaceError(409, "member_exists");
  if (code === "P2034") throw new AdminWorkspaceError(409, "ownership_conflict");
  throw error;
}

export async function changeAdminWorkspaceMember(workspaceId: string, input: {
  action: "ADD" | "CHANGE_ROLE" | "TRANSFER_OWNERSHIP";
  userId: string;
  role?: Exclude<MemberRole, "OWNER">;
}) {
  protectPlatformOwner(input.userId);
  const user = await targetUser(input.userId);
  try {
    return await prisma.$transaction(async (transaction) => {
      await assertMembershipChangeAllowed(transaction, workspaceId, user.id);
      if (input.action === "ADD") {
        if (!input.role) throw new AdminWorkspaceError(422, "role_required");
        return transaction.workspaceMember.create({
          data: { id: createId("member"), workspaceId, userId: user.id, email: user.email, role: input.role },
          select: { userId: true, email: true, role: true },
        });
      }
      const member = await transaction.workspaceMember.findFirst({ where: { workspaceId, userId: user.id } });
      if (!member) throw new AdminWorkspaceError(404, "member_not_found");
      if (input.action === "CHANGE_ROLE") {
        if (member.role === "OWNER") throw new AdminWorkspaceError(409, "owner_transfer_required");
        if (!input.role) throw new AdminWorkspaceError(422, "role_required");
        const changed = await transaction.workspaceMember.updateMany({ where: { id: member.id, role: { not: "OWNER" } }, data: { role: input.role } });
        if (changed.count !== 1) throw new AdminWorkspaceError(409, "owner_transfer_required");
        return transaction.workspaceMember.findUniqueOrThrow({ where: { id: member.id }, select: { userId: true, email: true, role: true } });
      }
      const currentOwner = await transaction.workspaceMember.findFirst({ where: { workspaceId, role: "OWNER" } });
      if (!currentOwner) throw new AdminWorkspaceError(409, "workspace_owner_missing");
      protectPlatformOwner(currentOwner.userId);
      if (currentOwner.id === member.id) return { userId: member.userId, email: member.email, role: member.role };
      await transaction.workspaceMember.update({ where: { id: currentOwner.id }, data: { role: "ADMIN" } });
      return transaction.workspaceMember.update({ where: { id: member.id }, data: { role: "OWNER" }, select: { userId: true, email: true, role: true } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof AdminWorkspaceError) throw error;
    return translateMembershipConflict(error);
  }
}

export async function removeAdminWorkspaceMember(workspaceId: string, userId: string) {
  return prisma.$transaction(async (transaction) => {
    await assertMembershipChangeAllowed(transaction, workspaceId, userId);
    const member = await transaction.workspaceMember.findFirst({ where: { workspaceId, userId } });
    if (!member) throw new AdminWorkspaceError(404, "member_not_found");
    if (member.role === "OWNER") throw new AdminWorkspaceError(409, "owner_transfer_required");
    const removed = await transaction.workspaceMember.deleteMany({ where: { id: member.id, role: { not: "OWNER" } } });
    if (removed.count !== 1) throw new AdminWorkspaceError(409, "owner_transfer_required");
    return { removed: true, userId };
  });
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
    protectPlatformOwner(protectedMember?.userId);
  }
  const status = input.action === "SUSPEND" ? "SUSPENDED" : "ACTIVE";
  const changed = await prisma.workspace.updateMany({
    where: { id: workspaceId, version: input.version, deletionScheduledAt: null, status: { in: ["ACTIVE", "SUSPENDED"] } },
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

// Audit JSON arrays are capped at 100 entries, so paused automations are
// recorded as nested chunks the resume command can read back in full.
const AUDIT_CHUNK = 100;
export const PAUSE_ALL_AUDIT_ACTION = "workspace.automations.pause_all";

function chunked<T>(values: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += AUDIT_CHUNK) chunks.push(values.slice(index, index + AUDIT_CHUNK));
  return chunks;
}

export async function pauseAdminWorkspaceAutomations(workspaceId: string, version: number) {
  const protectedMember = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: { in: getServerEnv().platformOwnerUserIds } }, select: { userId: true } });
  protectPlatformOwner(protectedMember?.userId);
  return prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.updateMany({
      where: { id: workspaceId, version },
      data: { version: { increment: 1 } },
    });
    if (workspace.count !== 1) throw new AdminWorkspaceError(409, "stale_version");
    const active = await transaction.automation.findMany({ where: { workspaceId, status: "ACTIVE" }, select: { id: true, version: true }, orderBy: { id: "asc" } });
    const paused: Array<{ id: string; version: number }> = [];
    for (const automation of active) {
      const changed = await transaction.automation.updateMany({
        where: { id: automation.id, version: automation.version, status: "ACTIVE" },
        data: { status: "PAUSED", version: { increment: 1 } },
      });
      if (changed.count === 1) paused.push({ id: automation.id, version: automation.version + 1 });
    }
    // Each entry is "<id>@<version after pause>" so a later resume only touches
    // automations nobody has changed since this pause.
    return { paused: paused.length, automationIds: chunked(paused.map((item) => `${item.id}@${item.version}`)), version: version + 1 };
  });
}

function pausedEntries(after: unknown): Array<{ id: string; version: number }> {
  const chunks = after && typeof after === "object" && "automationIds" in after ? (after as { automationIds?: unknown }).automationIds : undefined;
  if (!Array.isArray(chunks)) return [];
  return chunks.flat().flatMap((entry) => {
    const match = typeof entry === "string" ? /^(.+)@(\d+)$/.exec(entry) : null;
    return match ? [{ id: match[1], version: Number(match[2]) }] : [];
  });
}

/**
 * Re-activates the automations recorded by the most recent "pause all" audit
 * event. Automations edited, archived, or re-activated since then are skipped.
 */
export async function resumeAdminWorkspaceAutomations(workspaceId: string, version: number) {
  const protectedMember = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId: { in: getServerEnv().platformOwnerUserIds } }, select: { userId: true } });
  protectPlatformOwner(protectedMember?.userId);
  const lastPause = await prisma.adminAuditEvent.findFirst({
    where: { action: PAUSE_ALL_AUDIT_ACTION, targetType: "workspace", targetId: workspaceId, phase: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    select: { requestId: true, after: true },
  });
  const entries = pausedEntries(lastPause?.after);
  if (!lastPause || entries.length === 0) throw new AdminWorkspaceError(409, "nothing_to_resume");
  return prisma.$transaction(async (transaction) => {
    const workspace = await transaction.workspace.updateMany({
      where: { id: workspaceId, version, status: "ACTIVE", deletionScheduledAt: null },
      data: { version: { increment: 1 } },
    });
    if (workspace.count !== 1) {
      const exists = await transaction.workspace.count({ where: { id: workspaceId } });
      throw new AdminWorkspaceError(exists ? 409 : 404, exists ? "stale_version" : "workspace_not_found");
    }
    const resumed: string[] = [];
    for (const entry of entries) {
      const changed = await transaction.automation.updateMany({
        where: { id: entry.id, workspaceId, version: entry.version, status: "PAUSED", archivedAt: null },
        data: { status: "ACTIVE", version: { increment: 1 } },
      });
      if (changed.count === 1) resumed.push(entry.id);
    }
    return { resumed: resumed.length, skipped: entries.length - resumed.length, automationIds: chunked(resumed), pausedBy: lastPause.requestId, version: version + 1 };
  });
}

function formulaSafe(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const escaped = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/** Largest export served in one response; bigger tenants need an offline export. */
export const WORKSPACE_EXPORT_ROW_LIMIT = 50_000;

export async function loadSafeWorkspaceExport(workspaceId: string) {
  // Each relation reads at most one row past the cap, so an oversized tenant
  // is rejected without loading it into memory.
  const take = WORKSPACE_EXPORT_ROW_LIMIT + 1;
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: {
      id: true, name: true, slug: true, status: true, createdAt: true, updatedAt: true,
      members: { select: { userId: true, email: true, role: true }, orderBy: { id: "asc" }, take },
      automations: { select: { id: true, name: true, status: true, createdAt: true, updatedAt: true }, orderBy: { id: "asc" }, take },
      contacts: { select: { id: true, email: true, leadStatus: true, tags: true, createdAt: true, updatedAt: true }, orderBy: { id: "asc" }, take },
    },
  });
  if (!workspace) throw new AdminWorkspaceError(404, "workspace_not_found");
  const rows = 1 + workspace.members.length + workspace.automations.length + workspace.contacts.length;
  if (rows > WORKSPACE_EXPORT_ROW_LIMIT) throw new AdminWorkspaceError(422, "export_too_large");
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
