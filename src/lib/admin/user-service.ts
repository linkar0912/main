import "server-only";

import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { prisma } from "@/src/lib/prisma";
import type { MemberRole } from "@/src/lib/repository";
import { AdminWorkspaceError } from "./workspace-service";

function normalizedEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new AdminWorkspaceError(422, "invalid_email");
  }
  return email;
}

export function assertUserTargetAllowed(userId: string): void {
  if (getServerEnv().platformOwnerUserIds.includes(userId.toLowerCase())) {
    throw new AdminWorkspaceError(403, "platform_owner_protected");
  }
}

function authFailure(error: { message?: string; status?: number } | null, fallback: string): never {
  throw new AdminWorkspaceError(error?.status === 422 ? 422 : 502, fallback);
}

export async function createAdminUser(input: { email: string; mode: "INVITE" | "CREATE"; confirmed?: boolean }) {
  const auth = createSupabaseAdminClient().auth.admin;
  const email = normalizedEmail(input.email);
  if (input.mode === "INVITE") {
    const result = await auth.inviteUserByEmail(email, { redirectTo: `${getServerEnv().appUrl}/auth/confirm` });
    if (result.error || !result.data.user) authFailure(result.error, "user_invite_failed");
    return { id: result.data.user.id, email, invited: true, confirmed: false };
  }
  const result = await auth.createUser({ email, email_confirm: input.confirmed === true });
  if (result.error || !result.data.user) authFailure(result.error, "user_create_failed");
  return { id: result.data.user.id, email, invited: false, confirmed: input.confirmed === true };
}

export async function updateAdminUser(userId: string, input: { email: string; confirmEmail?: boolean }) {
  assertUserTargetAllowed(userId);
  const email = normalizedEmail(input.email);
  const result = await createSupabaseAdminClient().auth.admin.updateUserById(userId, {
    email,
    email_confirm: input.confirmEmail === true,
  });
  if (result.error || !result.data.user) authFailure(result.error, "user_update_failed");
  await prisma.workspaceMember.updateMany({ where: { userId }, data: { email } });
  return { id: userId, email, confirmed: Boolean(result.data.user.email_confirmed_at) };
}

export async function setAdminUserAccess(userId: string, input: {
  action: "SUSPEND" | "RESTORE" | "REVOKE_LINKAR_SESSIONS" | "BAN" | "UNBAN";
  reason: string;
  actorUserId: string;
}) {
  assertUserTargetAllowed(userId);
  const now = new Date();
  if (input.action === "BAN" || input.action === "UNBAN") {
    const result = await createSupabaseAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: input.action === "BAN" ? "876000h" : "none",
    });
    if (result.error) authFailure(result.error, input.action === "BAN" ? "user_ban_failed" : "user_unban_failed");
    if (input.action === "BAN") {
      await prisma.platformUserControl.upsert({
        where: { userId },
        create: { userId, status: "SUSPENDED", suspendedAt: now, suspendedReason: input.reason, suspendedByUserId: input.actorUserId, sessionInvalidBefore: now },
        update: { status: "SUSPENDED", suspendedAt: now, suspendedReason: input.reason, suspendedByUserId: input.actorUserId, sessionInvalidBefore: now },
      });
    }
    return { userId, action: input.action, at: now.toISOString() };
  }

  if (input.action === "REVOKE_LINKAR_SESSIONS") {
    await prisma.platformUserControl.upsert({
      where: { userId },
      create: { userId, sessionInvalidBefore: now },
      update: { sessionInvalidBefore: now },
    });
    return { userId, action: input.action, sessionInvalidBefore: now.toISOString() };
  }

  const suspended = input.action === "SUSPEND";
  await prisma.platformUserControl.upsert({
    where: { userId },
    create: {
      userId,
      status: suspended ? "SUSPENDED" : "ACTIVE",
      suspendedAt: suspended ? now : null,
      suspendedReason: suspended ? input.reason : null,
      suspendedByUserId: suspended ? input.actorUserId : null,
      sessionInvalidBefore: suspended ? now : null,
    },
    update: {
      status: suspended ? "SUSPENDED" : "ACTIVE",
      suspendedAt: suspended ? now : null,
      suspendedReason: suspended ? input.reason : null,
      suspendedByUserId: suspended ? input.actorUserId : null,
      ...(suspended ? { sessionInvalidBefore: now } : {}),
    },
  });
  return { userId, action: input.action, status: suspended ? "SUSPENDED" : "ACTIVE", at: now.toISOString() };
}

export async function sendAdminPasswordReset(userId: string) {
  assertUserTargetAllowed(userId);
  const client = createSupabaseAdminClient();
  const found = await client.auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (found.error || !email) throw new AdminWorkspaceError(404, "user_not_found");
  const reset = await client.auth.resetPasswordForEmail(email, { redirectTo: `${getServerEnv().appUrl}/auth/confirm` });
  if (reset.error) authFailure(reset.error, "password_reset_failed");
  return { userId, email, sent: true };
}

export async function changeAdminUserMembership(userId: string, input: {
  action: "ADD" | "CHANGE_ROLE" | "REMOVE";
  workspaceId: string;
  role?: Exclude<MemberRole, "OWNER"> | "OWNER";
}) {
  assertUserTargetAllowed(userId);
  const found = await createSupabaseAdminClient().auth.admin.getUserById(userId);
  const email = found.data.user?.email;
  if (found.error || !email) throw new AdminWorkspaceError(404, "user_not_found");

  return prisma.$transaction(async (transaction) => {
    const existing = await transaction.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, userId } });
    if (input.action === "ADD") {
      if (existing) throw new AdminWorkspaceError(409, "member_exists");
      if (!input.role) throw new AdminWorkspaceError(422, "role_required");
      if (input.role === "OWNER") {
        const owner = await transaction.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, role: "OWNER" } });
        if (owner) throw new AdminWorkspaceError(409, "owner_transfer_required");
      }
      return transaction.workspaceMember.create({ data: { id: createId("member"), workspaceId: input.workspaceId, userId, email: email.toLowerCase(), role: input.role }, select: { workspaceId: true, role: true } });
    }
    if (!existing) throw new AdminWorkspaceError(404, "member_not_found");
    if (existing.role === "OWNER") throw new AdminWorkspaceError(409, "owner_transfer_required");
    if (input.action === "REMOVE") {
      await transaction.workspaceMember.delete({ where: { id: existing.id } });
      return { workspaceId: input.workspaceId, removed: true };
    }
    if (!input.role || input.role === "OWNER") throw new AdminWorkspaceError(422, "invalid_role");
    return transaction.workspaceMember.update({ where: { id: existing.id }, data: { role: input.role }, select: { workspaceId: true, role: true } });
  });
}
