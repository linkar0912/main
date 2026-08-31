import "server-only";

import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { boundedAdminLimit } from "../accounts-repository";
import { decodeAdminCursor, encodeAdminCursor } from "../cursor";
import type { AdminOperationDetail, AdminOperationFilter, AdminOperationItem, AdminOperationKind, AdminOperationPage } from "./types";

type Client = typeof prisma;
type CommonRecord = Omit<AdminOperationItem, "kind">;

function safeCode(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return /^[A-Z][A-Z0-9_]{1,79}$/.test(value) ? value : "ERROR_RECORDED";
}

function cursorWhere(filter: AdminOperationFilter, secret: string, dateField: string) {
  if (!filter.cursor) return {};
  const cursor = decodeAdminCursor(filter.cursor, secret);
  const at = new Date(cursor.createdAt);
  return { OR: [{ [dateField]: { lt: at } }, { [dateField]: at, id: { gt: cursor.id } }] };
}

function dateWhere(filter: AdminOperationFilter) {
  return filter.from || filter.to ? { gte: filter.from ? new Date(filter.from) : undefined, lte: filter.to ? new Date(filter.to) : undefined } : undefined;
}

function page(items: CommonRecord[], kind: AdminOperationKind, limit: number, secret: string): AdminOperationPage {
  const hasMore = items.length > limit;
  const selected = items.slice(0, limit).map((item) => ({ ...item, kind }));
  const last = selected.at(-1);
  return { items: selected, nextCursor: hasMore && last ? encodeAdminCursor({ id: last.id, createdAt: last.createdAt }, secret) : null };
}

function providerFor(input: { instagramAccountId?: string | null; facebookPageId?: string | null; kind?: string; eventType?: string }): "instagram" | "facebook" | undefined {
  if (input.facebookPageId || input.kind?.toLowerCase().includes("facebook") || input.eventType?.toLowerCase().startsWith("facebook")) return "facebook";
  if (input.instagramAccountId || input.kind || input.eventType) return "instagram";
  return undefined;
}

const actions: Record<AdminOperationKind, string[]> = {
  automation: ["activate", "pause", "archive", "restore_version"], sequence: ["activate", "pause", "archive"],
  broadcast: ["cancel_pending", "retry_failed"], contact: ["suppress", "unsuppress", "delete", "export_one"],
  tracked_link: ["update_destination", "disable", "enable", "delete"], delivery: ["retry", "cancel_pending", "release_stale_claim"], webhook: ["reprocess"],
};

export function createAdminOperationsRepository(client: Client = prisma, secret = getServerEnv().authSessionSecret) {
  return {
    async list(kind: AdminOperationKind, filter: AdminOperationFilter): Promise<AdminOperationPage> {
      const limit = boundedAdminLimit(filter.limit);
      const workspace = { select: { id: true, name: true } } as const;
      if (kind === "automation") {
        const rows = await client.automation.findMany({ where: { workspaceId: filter.workspaceId, status: filter.status as never, name: filter.text ? { contains: filter.text, mode: "insensitive" } : undefined, createdAt: dateWhere(filter), ...cursorWhere(filter, secret, "createdAt"), ...(filter.provider === "facebook" ? { facebookPageId: { not: null } } : filter.provider === "instagram" ? { facebookPageId: null } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1, select: { id: true, name: true, status: true, version: true, createdAt: true, updatedAt: true, instagramAccountId: true, facebookPageId: true, workspace, _count: { select: { executions: true, participants: true } } } });
        return page(rows.map((row) => ({ id: row.id, workspace: row.workspace, title: row.name, status: row.status, version: row.version, provider: providerFor(row), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), metrics: { executions: row._count.executions, participants: row._count.participants } })), kind, limit, secret);
      }
      if (kind === "sequence") {
        const rows = await client.automationSequence.findMany({ where: { workspaceId: filter.workspaceId, status: filter.status, name: filter.text ? { contains: filter.text, mode: "insensitive" } : undefined, createdAt: dateWhere(filter), ...cursorWhere(filter, secret, "createdAt") }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1, select: { id: true, name: true, status: true, version: true, createdAt: true, updatedAt: true, workspace, _count: { select: { enrollments: true } } } });
        return page(rows.map((row) => ({ id: row.id, workspace: row.workspace, title: row.name, status: row.status, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), metrics: { enrollments: row._count.enrollments } })), kind, limit, secret);
      }
      if (kind === "broadcast") {
        const rows = await client.broadcast.findMany({ where: { workspaceId: filter.workspaceId, status: filter.status, name: filter.text ? { contains: filter.text, mode: "insensitive" } : undefined, createdAt: dateWhere(filter), ...cursorWhere(filter, secret, "createdAt") }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1, select: { id: true, name: true, status: true, version: true, createdAt: true, completedAt: true, workspace, total: true, sent: true, failed: true, skipped: true } });
        return page(rows.map((row) => ({ id: row.id, workspace: row.workspace, title: row.name, status: row.status, version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: (row.completedAt ?? row.createdAt).toISOString(), metrics: { total: row.total, sent: row.sent, failed: row.failed, skipped: row.skipped } })), kind, limit, secret);
      }
      if (kind === "contact") {
        const rows = await client.automationContact.findMany({ where: { workspaceId: filter.workspaceId, ...(filter.status === "SUPPRESSED" ? { suppressedAt: { not: null } } : filter.status === "ACTIVE" ? { suppressedAt: null } : {}), email: filter.text ? { contains: filter.text, mode: "insensitive" } : undefined, createdAt: dateWhere(filter), ...cursorWhere(filter, secret, "createdAt") }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1, select: { id: true, email: true, igScopedUserId: true, suppressedAt: true, version: true, createdAt: true, updatedAt: true, leadStatus: true, score: true, workspace } });
        return page(rows.map((row) => ({ id: row.id, workspace: row.workspace, title: row.email ?? `Instagram user ${row.igScopedUserId.slice(-6)}`, status: row.suppressedAt ? "SUPPRESSED" : "ACTIVE", version: row.version, provider: "instagram", createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), metrics: { score: row.score } })), kind, limit, secret);
      }
      if (kind === "tracked_link") {
        const rows = await client.trackedLink.findMany({ where: { workspaceId: filter.workspaceId, ...(filter.status === "DISABLED" ? { disabledAt: { not: null } } : filter.status === "ACTIVE" ? { disabledAt: null } : {}), slug: filter.text ? { contains: filter.text, mode: "insensitive" } : undefined, createdAt: dateWhere(filter), ...cursorWhere(filter, secret, "createdAt") }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1, select: { id: true, slug: true, disabledAt: true, version: true, createdAt: true, updatedAt: true, workspace, _count: { select: { clicks: true } } } });
        return page(rows.map((row) => ({ id: row.id, workspace: row.workspace, title: row.slug, status: row.disabledAt ? "DISABLED" : "ACTIVE", version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), metrics: { clicks: row._count.clicks } })), kind, limit, secret);
      }
      if (kind === "delivery") {
        const rows = await client.outboundDelivery.findMany({ where: { workspaceId: filter.workspaceId, state: filter.status, kind: filter.text ? { contains: filter.text, mode: "insensitive" } : undefined, createdAt: dateWhere(filter), ...cursorWhere(filter, secret, "createdAt") }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: limit + 1, select: { id: true, kind: true, state: true, version: true, resultCode: true, lastError: true, attemptCount: true, createdAt: true, updatedAt: true, instagramAccountId: true, workspace } });
        return page(rows.map((row) => ({ id: row.id, workspace: row.workspace, title: row.kind, status: row.state, version: row.version, provider: providerFor(row), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), metrics: { attempts: row.attemptCount }, safeErrorCode: safeCode(row.resultCode) ?? (row.lastError ? "ERROR_RECORDED" : undefined) })), kind, limit, secret);
      }
      const rows = await client.webhookEvent.findMany({ where: { workspaceId: filter.workspaceId, ...(filter.status === "PROCESSED" ? { processedAt: { not: null } } : filter.status === "RECEIVED" ? { processedAt: null } : {}), eventType: filter.text ? { contains: filter.text, mode: "insensitive" } : undefined, receivedAt: dateWhere(filter), ...cursorWhere(filter, secret, "receivedAt") }, orderBy: [{ receivedAt: "desc" }, { id: "asc" }], take: limit + 1, select: { id: true, eventType: true, processedAt: true, version: true, adminReprocessCount: true, receivedAt: true, workspace } });
      return page(rows.map((row) => ({ id: row.id, workspace: row.workspace, title: row.eventType, status: row.processedAt ? "PROCESSED" : "RECEIVED", version: row.version, provider: providerFor(row), createdAt: row.receivedAt.toISOString(), updatedAt: (row.processedAt ?? row.receivedAt).toISOString(), metrics: { adminReprocesses: row.adminReprocessCount } })), kind, limit, secret);
    },

    async get(kind: AdminOperationKind, id: string): Promise<AdminOperationDetail | null> {
      // Explicit ID projections intentionally cannot expose hidden columns.
      const workspace = { select: { id: true, name: true } } as const;
      let item: AdminOperationItem | null = null;
      let attributes: AdminOperationDetail["attributes"] = {};
      if (kind === "automation") { const r = await client.automation.findUnique({ where: { id }, select: { id: true, name: true, status: true, version: true, priority: true, createdAt: true, updatedAt: true, instagramAccountId: true, facebookPageId: true, workspace } }); if (r) { item = { id, kind, workspace: r.workspace, title: r.name, status: r.status, version: r.version, provider: providerFor(r), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }; attributes = { priority: r.priority, channelScoped: Boolean(r.instagramAccountId || r.facebookPageId) }; } }
      else if (kind === "sequence") { const r = await client.automationSequence.findUnique({ where: { id }, select: { id: true, name: true, status: true, version: true, sourceAutomationId: true, createdAt: true, updatedAt: true, workspace } }); if (r) { item = { id, kind, workspace: r.workspace, title: r.name, status: r.status, version: r.version, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }; attributes = { sourceAutomationId: r.sourceAutomationId }; } }
      else if (kind === "broadcast") { const r = await client.broadcast.findUnique({ where: { id }, select: { id: true, name: true, segment: true, status: true, version: true, total: true, sent: true, failed: true, skipped: true, createdAt: true, completedAt: true, workspace } }); if (r) { item = { id, kind, workspace: r.workspace, title: r.name, status: r.status, version: r.version, createdAt: r.createdAt.toISOString(), updatedAt: (r.completedAt ?? r.createdAt).toISOString(), metrics: { total: r.total, sent: r.sent, failed: r.failed, skipped: r.skipped } }; attributes = { segment: r.segment }; } }
      else if (kind === "contact") { const r = await client.automationContact.findUnique({ where: { id }, select: { id: true, email: true, igScopedUserId: true, leadStatus: true, score: true, suppressedAt: true, version: true, createdAt: true, updatedAt: true, workspace } }); if (r) { item = { id, kind, workspace: r.workspace, title: r.email ?? `Instagram user ${r.igScopedUserId.slice(-6)}`, status: r.suppressedAt ? "SUPPRESSED" : "ACTIVE", version: r.version, provider: "instagram", createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }; attributes = { email: r.email, leadStatus: r.leadStatus, score: r.score }; } }
      else if (kind === "tracked_link") { const r = await client.trackedLink.findUnique({ where: { id }, select: { id: true, slug: true, destination: true, expiresAt: true, disabledAt: true, version: true, createdAt: true, updatedAt: true, workspace } }); if (r) { item = { id, kind, workspace: r.workspace, title: r.slug, status: r.disabledAt ? "DISABLED" : "ACTIVE", version: r.version, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }; attributes = { destination: r.destination, expiresAt: r.expiresAt?.toISOString() ?? null }; } }
      else if (kind === "delivery") { const r = await client.outboundDelivery.findUnique({ where: { id }, select: { id: true, kind: true, state: true, version: true, resultCode: true, lastError: true, retryable: true, attemptCount: true, providerMessageId: true, claimExpiresAt: true, createdAt: true, updatedAt: true, instagramAccountId: true, workspace } }); if (r) { item = { id, kind: "delivery", workspace: r.workspace, title: r.kind, status: r.state, version: r.version, provider: providerFor(r), createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), metrics: { attempts: r.attemptCount }, safeErrorCode: safeCode(r.resultCode) ?? (r.lastError ? "ERROR_RECORDED" : undefined) }; attributes = { retryable: r.retryable, hasProviderReceipt: Boolean(r.providerMessageId), claimExpiresAt: r.claimExpiresAt?.toISOString() ?? null }; } }
      else { const r = await client.webhookEvent.findUnique({ where: { id }, select: { id: true, providerEventId: true, eventType: true, receivedAt: true, processedAt: true, version: true, adminReprocessCount: true, workspace } }); if (r) { item = { id, kind: "webhook", workspace: r.workspace, title: r.eventType, status: r.processedAt ? "PROCESSED" : "RECEIVED", version: r.version, provider: providerFor(r), createdAt: r.receivedAt.toISOString(), updatedAt: (r.processedAt ?? r.receivedAt).toISOString(), metrics: { adminReprocesses: r.adminReprocessCount } }; attributes = { providerEventId: r.providerEventId }; } }
      return item ? { ...item, attributes, allowedActions: actions[kind] } : null;
    },
  };
}

let operationsRepository: ReturnType<typeof createAdminOperationsRepository> | undefined;
export function getAdminOperationsRepository() { operationsRepository ??= createAdminOperationsRepository(); return operationsRepository; }
