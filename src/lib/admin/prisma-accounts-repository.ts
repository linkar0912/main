import "server-only";

import type { User } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import type { PlatformUserStatus, WorkspaceStatus } from "@/src/lib/repository";
import {
  boundedAdminLimit,
  type AdminAccountsRepository,
  type AdminUserSummary,
  type AdminWorkspaceSummary,
} from "./accounts-repository";
import { decodeAdminCursor, encodeAdminCursor } from "./cursor";

function workspaceSummary(record: {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  entitlement: { plan: { key: string; name: string } } | null;
  _count: { members: number; automations: number; connections: number; facebookPages: number };
}): AdminWorkspaceSummary {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
    planKey: record.entitlement?.plan.key ?? "unassigned",
    planName: record.entitlement?.plan.name ?? "Unassigned",
    memberCount: record._count.members,
    automationCount: record._count.automations,
    instagramConnectionCount: record._count.connections,
    facebookConnectionCount: record._count.facebookPages,
  };
}

function authCreatedAt(user: User): string {
  return new Date(user.created_at).toISOString();
}

export function createPrismaAdminAccountsRepository(
  client = prisma,
  authAdmin = createSupabaseAdminClient(),
  cursorSecret = getServerEnv().authSessionSecret,
): AdminAccountsRepository {
  return {
    async listAdminWorkspaces(query) {
      const limit = boundedAdminLimit(query.limit);
      const cursor = query.cursor ? decodeAdminCursor(query.cursor, cursorSecret) : null;
      const search = query.search?.trim();
      const records = await client.workspace.findMany({
        where: {
          AND: [
            ...(search ? [{ OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search, mode: "insensitive" as const } },
            ] }] : []),
            ...(cursor ? [{ OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              { createdAt: new Date(cursor.createdAt), id: { gt: cursor.id } },
            ] }] : []),
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit + 1,
        include: {
          entitlement: { select: { plan: { select: { key: true, name: true } } } },
          _count: { select: { members: true, automations: true, connections: true, facebookPages: true } },
        },
      });
      const hasMore = records.length > limit;
      const items = records.slice(0, limit).map((record) => workspaceSummary({ ...record, status: record.status as WorkspaceStatus }));
      const last = items.at(-1);
      return { items, nextCursor: hasMore && last ? encodeAdminCursor({ id: last.id, createdAt: last.createdAt }, cursorSecret) : null };
    },

    async getAdminWorkspace(id) {
      const record = await client.workspace.findUnique({
        where: { id },
        include: {
          entitlement: { include: { plan: { select: { key: true, name: true } } } },
          members: { orderBy: [{ role: "asc" }, { email: "asc" }], select: { userId: true, email: true, role: true } },
          connections: { orderBy: { connectedAt: "desc" }, select: { id: true, igUserId: true, username: true, status: true, connectedAt: true } },
          facebookPages: { orderBy: { connectedAt: "desc" }, select: { id: true, pageId: true, pageName: true, status: true, connectedAt: true } },
          _count: { select: { members: true, automations: true, connections: true, facebookPages: true } },
        },
      });
      if (!record) return null;
      return {
        ...workspaceSummary({ ...record, status: record.status as WorkspaceStatus }),
        suspendedAt: record.suspendedAt?.toISOString(),
        suspendedReason: record.suspendedReason ?? undefined,
        deletionScheduledAt: record.deletionScheduledAt?.toISOString(),
        entitlementVersion: record.entitlement?.version,
        members: record.members.map((member) => ({ userId: member.userId ?? undefined, email: member.email, role: member.role })),
        instagramConnections: record.connections.map((connection) => ({ ...connection, status: String(connection.status), connectedAt: connection.connectedAt.toISOString() })),
        facebookConnections: record.facebookPages.map((connection) => ({ ...connection, status: String(connection.status), connectedAt: connection.connectedAt.toISOString() })),
      };
    },

    async listAdminUsers(query) {
      const limit = boundedAdminLimit(query.limit);
      const cursor = query.cursor ? decodeAdminCursor(query.cursor, cursorSecret) : null;
      const search = query.search?.trim().toLowerCase();
      const authUsers: User[] = [];
      for (let page = 1; page <= 10 && authUsers.length < 10_000; page += 1) {
        const result = await authAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (result.error) throw result.error;
        authUsers.push(...result.data.users);
        if (result.data.users.length < 1000) break;
      }
      const filtered = authUsers
        .filter((user) => user.email && (!search || user.email.toLowerCase().includes(search)))
        .filter((user) => !cursor || authCreatedAt(user) < cursor.createdAt || (authCreatedAt(user) === cursor.createdAt && user.id > cursor.id))
        .sort((a, b) => authCreatedAt(b).localeCompare(authCreatedAt(a)) || a.id.localeCompare(b.id));
      const selected = filtered.slice(0, limit + 1);
      const ids = selected.map((user) => user.id);
      const [controls, memberships] = await Promise.all([
        client.platformUserControl.findMany({ where: { userId: { in: ids } }, select: { userId: true, status: true } }),
        client.workspaceMember.groupBy({ by: ["userId"], where: { userId: { in: ids } }, _count: { _all: true } }),
      ]);
      const statusById = new Map(controls.map((control) => [control.userId, control.status as PlatformUserStatus]));
      const countById = new Map(memberships.flatMap((membership) => membership.userId ? [[membership.userId, membership._count._all] as const] : []));
      const items: AdminUserSummary[] = selected.slice(0, limit).map((user) => ({
        id: user.id,
        email: user.email!,
        status: statusById.get(user.id) ?? "ACTIVE",
        createdAt: authCreatedAt(user),
        lastSignInAt: user.last_sign_in_at ? new Date(user.last_sign_in_at).toISOString() : null,
        workspaceCount: countById.get(user.id) ?? 0,
      }));
      const last = items.at(-1);
      return {
        items,
        nextCursor: selected.length > limit && last ? encodeAdminCursor({ id: last.id, createdAt: last.createdAt }, cursorSecret) : null,
      };
    },

    async getAdminUser(id) {
      const result = await authAdmin.auth.admin.getUserById(id);
      const email = result.data.user?.email;
      if (result.error || !email) return null;
      const [control, memberships] = await Promise.all([
        client.platformUserControl.findUnique({ where: { userId: id } }),
        client.workspaceMember.findMany({
          where: { userId: id },
          include: { workspace: { select: { id: true, name: true, status: true } } },
          orderBy: { workspaceId: "asc" },
        }),
      ]);
      const user = result.data.user;
      return {
        id: user.id,
        email,
        status: (control?.status as PlatformUserStatus | undefined) ?? "ACTIVE",
        createdAt: authCreatedAt(user),
        lastSignInAt: user.last_sign_in_at ? new Date(user.last_sign_in_at).toISOString() : null,
        workspaceCount: memberships.length,
        sessionInvalidBefore: control?.sessionInvalidBefore?.toISOString(),
        suspendedAt: control?.suspendedAt?.toISOString(),
        suspendedReason: control?.suspendedReason ?? undefined,
        workspaces: memberships.map((membership) => ({
          id: membership.workspace.id,
          name: membership.workspace.name,
          status: membership.workspace.status as WorkspaceStatus,
          role: membership.role,
        })),
      };
    },
  };
}
