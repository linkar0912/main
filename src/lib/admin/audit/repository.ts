import "server-only";

import type { AdminAuditPhase, Prisma } from "@prisma/client";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { decodeAdminCursor, encodeAdminCursor } from "../cursor";

export type AuditFilters = { actor?: string; action?: string; targetType?: string; targetId?: string; workspaceId?: string; requestId?: string; phase?: AdminAuditPhase; origin?: string; from?: string; to?: string; cursor?: string | null; limit?: number };

function whereFor(filter: AuditFilters, cursorSecret: string): Prisma.AdminAuditEventWhereInput {
  const cursor = filter.cursor ? decodeAdminCursor(filter.cursor, cursorSecret) : null;
  return {
    actorEmail: filter.actor ? { contains: filter.actor, mode: "insensitive" } : undefined,
    action: filter.action ? { contains: filter.action, mode: "insensitive" } : undefined,
    targetType: filter.targetType || undefined, targetId: filter.targetId || undefined,
    workspaceId: filter.workspaceId || undefined, requestId: filter.requestId || undefined,
    phase: filter.phase, origin: filter.origin ? { contains: filter.origin, mode: "insensitive" } : undefined,
    createdAt: filter.from || filter.to ? { gte: filter.from ? new Date(filter.from) : undefined, lte: filter.to ? new Date(filter.to) : undefined } : undefined,
    ...(cursor ? { OR: [{ createdAt: { lt: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } }] } : {}),
  };
}

const safeSelect = { id: true, requestId: true, phase: true, actorUserId: true, actorEmail: true, action: true, targetType: true, targetId: true, workspaceId: true, reason: true, before: true, after: true, errorCode: true, origin: true, createdAt: true } as const;

export async function listAdminAuditEvents(filter: AuditFilters, client = prisma, cursorSecret = getServerEnv().authSessionSecret) {
  const limit = Math.min(100, Math.max(1, filter.limit ?? 50));
  const rows = await client.adminAuditEvent.findMany({ where: whereFor(filter, cursorSecret), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1, select: safeSelect });
  const items = rows.slice(0, limit); const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? encodeAdminCursor({ id: last.id, createdAt: last.createdAt.toISOString() }, cursorSecret) : null };
}

export async function exportAdminAuditEvents(filter: AuditFilters, client = prisma) {
  return client.adminAuditEvent.findMany({ where: whereFor({ ...filter, cursor: null }, getServerEnv().authSessionSecret), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 10_001, select: { id: true, requestId: true, phase: true, actorEmail: true, action: true, targetType: true, targetId: true, workspaceId: true, reason: true, errorCode: true, origin: true, createdAt: true } });
}
