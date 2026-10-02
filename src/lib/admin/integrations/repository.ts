import "server-only";
import { prisma } from "@/src/lib/prisma";
import { z } from "zod";
import { getServerEnv } from "@/src/lib/env";
import { decodeAdminCursor, encodeAdminCursor } from "../cursor";
import type { AdminIntegrationItem, AdminIntegrationProvider, TokenExpiryBucket } from "./types";

export function expiryBucket(value: Date | null, now = new Date()): TokenExpiryBucket { if (!value) return "unknown"; const delta = value.getTime() - now.getTime(); if (delta <= 0) return "expired"; if (delta <= 86_400_000) return "within_24_hours"; if (delta <= 7 * 86_400_000) return "within_7_days"; if (delta <= 30 * 86_400_000) return "within_30_days"; return "later"; }
export const AdminIntegrationQuery = z.object({
  provider: z.enum(["instagram", "facebook"]).optional(), workspaceId: z.string().min(1).max(128).optional(),
  status: z.enum(["CONNECTED", "DISCONNECTED", "EXPIRED"]).optional(),
  expiry: z.enum(["expired", "within_24_hours", "within_7_days", "within_30_days", "later", "unknown"]).optional(),
  text: z.string().trim().min(1).max(120).optional(), cursor: z.string().min(1).max(1024).optional(),
}).strict();

export function integrationExpiryWhere(bucket: TokenExpiryBucket | undefined, now: Date) {
  const after = (days: number) => new Date(now.getTime() + days * 86_400_000);
  switch (bucket) {
    case "unknown": return { tokenExpiresAt: null };
    case "expired": return { tokenExpiresAt: { lte: now } };
    case "within_24_hours": return { tokenExpiresAt: { gt: now, lte: after(1) } };
    case "within_7_days": return { tokenExpiresAt: { gt: after(1), lte: after(7) } };
    case "within_30_days": return { tokenExpiresAt: { gt: after(7), lte: after(30) } };
    case "later": return { tokenExpiresAt: { gt: after(30) } };
    default: return {};
  }
}
export function createAdminIntegrationsRepository(client = prisma, now: () => Date = () => new Date()) {
  return {
    async list(filter: z.infer<typeof AdminIntegrationQuery> = {}) {
      return (await this.listPage(filter)).items;
    },
    async listPage(filter: { provider?: AdminIntegrationProvider; workspaceId?: string; status?: string; expiry?: TokenExpiryBucket; text?: string; cursor?: string } = {}): Promise<{ items: AdminIntegrationItem[]; nextCursor: string | null }> {
      const timestamp = now();
      const secret = getServerEnv().authSessionSecret;
      const cursor = filter.cursor ? decodeAdminCursor(filter.cursor, secret) : null;
      const cursorFilter = cursor ? { OR: [{ connectedAt: { lt: new Date(cursor.createdAt) } }, { connectedAt: new Date(cursor.createdAt), id: { gt: cursor.id } }] } : {};
      const common = { workspaceId: filter.workspaceId, status: filter.status as never, ...integrationExpiryWhere(filter.expiry, timestamp), AND: [cursorFilter] };
      const workspace = { select: { id: true, name: true } } as const;
      const [instagram, facebook] = await Promise.all([
        filter.provider === "facebook" ? [] : client.instagramConnection.findMany({ where: { ...common, OR: filter.text ? [{ username: { contains: filter.text, mode: "insensitive" } }, { igUserId: { contains: filter.text } }] : undefined }, orderBy: [{ connectedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, igUserId: true, username: true, status: true, tokenExpiresAt: true, connectedAt: true, version: true, workspace } }),
        filter.provider === "instagram" ? [] : client.facebookPageConnection.findMany({ where: { ...common, OR: filter.text ? [{ pageName: { contains: filter.text, mode: "insensitive" } }, { pageId: { contains: filter.text } }] : undefined }, orderBy: [{ connectedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, pageId: true, pageName: true, status: true, tokenExpiresAt: true, connectedAt: true, version: true, workspace } }),
      ]);
      const items: AdminIntegrationItem[] = [...instagram.map((r) => ({ id: r.id, provider: "instagram" as const, workspace: r.workspace, accountId: r.igUserId, accountName: `@${r.username}`, status: r.status, version: r.version, tokenExpiry: expiryBucket(r.tokenExpiresAt, timestamp), tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null, connectedAt: r.connectedAt.toISOString(), subscriptionHealth: "unchecked" as const, allowedActions: ["refresh_token", "mark_expired", "repair_subscription", "disconnect"] })), ...facebook.map((r) => ({ id: r.id, provider: "facebook" as const, workspace: r.workspace, accountId: r.pageId, accountName: r.pageName, status: r.status, version: r.version, tokenExpiry: expiryBucket(r.tokenExpiresAt, timestamp), tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null, connectedAt: r.connectedAt.toISOString(), subscriptionHealth: "unchecked" as const, allowedActions: ["mark_expired", "repair_subscription", "disconnect"] }))];
      const sorted = items.sort((a, b) => b.connectedAt.localeCompare(a.connectedAt) || a.id.localeCompare(b.id));
      const selected = sorted.slice(0, 100);
      const last = selected.at(-1);
      return { items: selected, nextCursor: sorted.length > 100 && last ? encodeAdminCursor({ createdAt: last.connectedAt, id: last.id }, secret) : null };
    },
  };
}
let repository: ReturnType<typeof createAdminIntegrationsRepository> | undefined;
export function getAdminIntegrationsRepository() { repository ??= createAdminIntegrationsRepository(); return repository; }
