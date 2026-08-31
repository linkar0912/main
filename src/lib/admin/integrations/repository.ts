import "server-only";
import { prisma } from "@/src/lib/prisma";
import type { AdminIntegrationItem, AdminIntegrationProvider, TokenExpiryBucket } from "./types";

export function expiryBucket(value: Date | null, now = new Date()): TokenExpiryBucket { if (!value) return "unknown"; const delta = value.getTime() - now.getTime(); if (delta <= 0) return "expired"; if (delta <= 86_400_000) return "within_24_hours"; if (delta <= 7 * 86_400_000) return "within_7_days"; if (delta <= 30 * 86_400_000) return "within_30_days"; return "later"; }
export function createAdminIntegrationsRepository(client = prisma, now: () => Date = () => new Date()) {
  return {
    async list(filter: { provider?: AdminIntegrationProvider; workspaceId?: string; status?: string; expiry?: TokenExpiryBucket; text?: string } = {}): Promise<AdminIntegrationItem[]> {
      const workspace = { select: { id: true, name: true } } as const;
      const [instagram, facebook] = await Promise.all([
        filter.provider === "facebook" ? [] : client.instagramConnection.findMany({ where: { workspaceId: filter.workspaceId, status: filter.status as never, OR: filter.text ? [{ username: { contains: filter.text, mode: "insensitive" } }, { igUserId: { contains: filter.text } }] : undefined }, orderBy: [{ connectedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, igUserId: true, username: true, status: true, tokenExpiresAt: true, connectedAt: true, version: true, workspace } }),
        filter.provider === "instagram" ? [] : client.facebookPageConnection.findMany({ where: { workspaceId: filter.workspaceId, status: filter.status as never, OR: filter.text ? [{ pageName: { contains: filter.text, mode: "insensitive" } }, { pageId: { contains: filter.text } }] : undefined }, orderBy: [{ connectedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, pageId: true, pageName: true, status: true, tokenExpiresAt: true, connectedAt: true, version: true, workspace } }),
      ]);
      const items: AdminIntegrationItem[] = [...instagram.map((r) => ({ id: r.id, provider: "instagram" as const, workspace: r.workspace, accountId: r.igUserId, accountName: `@${r.username}`, status: r.status, version: r.version, tokenExpiry: expiryBucket(r.tokenExpiresAt, now()), tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null, connectedAt: r.connectedAt.toISOString(), subscriptionHealth: "unchecked" as const, allowedActions: ["refresh_token", "mark_expired", "repair_subscription", "disconnect"] })), ...facebook.map((r) => ({ id: r.id, provider: "facebook" as const, workspace: r.workspace, accountId: r.pageId, accountName: r.pageName, status: r.status, version: r.version, tokenExpiry: expiryBucket(r.tokenExpiresAt, now()), tokenExpiresAt: r.tokenExpiresAt?.toISOString() ?? null, connectedAt: r.connectedAt.toISOString(), subscriptionHealth: "unchecked" as const, allowedActions: ["mark_expired", "repair_subscription", "disconnect"] }))];
      return items.filter((item) => !filter.expiry || item.tokenExpiry === filter.expiry).sort((a, b) => b.connectedAt.localeCompare(a.connectedAt) || a.id.localeCompare(b.id)).slice(0, 100);
    },
  };
}
let repository: ReturnType<typeof createAdminIntegrationsRepository> | undefined;
export function getAdminIntegrationsRepository() { repository ??= createAdminIntegrationsRepository(); return repository; }
