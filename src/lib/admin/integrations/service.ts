import "server-only";

import { z } from "zod";
import { MetaClient } from "@/src/lib/meta/client";
import { refreshInstagramToken } from "@/src/lib/meta/oauth";
import { readFacebookPageWebhookSubscription, subscribeFacebookPageToWebhooks, unsubscribeFacebookPageFromWebhooks } from "@/src/lib/facebook/oauth";
import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { sealSecret, unsealSecret } from "@/src/lib/security/secrets";
import { AdminWorkspaceError } from "../workspace-service";
import { expiryBucket } from "./repository";
import type { AdminIntegrationDetail, AdminIntegrationProvider } from "./types";

const EXPECTED = { instagram: ["comments", "messages"], facebook: ["feed"] } as const;
export const IntegrationActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.enum(["refresh_token", "mark_expired", "repair_subscription", "prepare_disconnect"]), version: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("disconnect"), version: z.number().int().positive(), challengeToken: z.string().min(16), confirmation: z.string().min(1).max(300) }).strict(),
]);

async function rawConnection(provider: AdminIntegrationProvider, id: string) {
  if (provider === "instagram") { const r = await prisma.instagramConnection.findUnique({ where: { id }, include: { workspace: { select: { id: true, name: true, members: { select: { userId: true } } } } } }); return r ? { provider, id: r.id, workspace: r.workspace, accountId: r.igUserId, accountName: `@${r.username}`, status: r.status, version: r.version, tokenExpiresAt: r.tokenExpiresAt, connectedAt: r.connectedAt, accessTokenEncrypted: r.accessTokenEncrypted } as const : null; }
  const r = await prisma.facebookPageConnection.findUnique({ where: { id }, include: { workspace: { select: { id: true, name: true, members: { select: { userId: true } } } } } }); return r ? { provider, id: r.id, workspace: r.workspace, accountId: r.pageId, accountName: r.pageName, status: r.status, version: r.version, tokenExpiresAt: r.tokenExpiresAt, connectedAt: r.connectedAt, accessTokenEncrypted: r.accessTokenEncrypted } as const : null;
}
function protect(record: NonNullable<Awaited<ReturnType<typeof rawConnection>>>) { const owners = new Set(getServerEnv().platformOwnerUserIds); if (record.workspace.members.some((member) => member.userId && owners.has(member.userId.toLowerCase()))) throw new AdminWorkspaceError(403, "owner_workspace_protected"); }
function encryptionKey(provider: AdminIntegrationProvider): string { const env = getServerEnv(); const key = provider === "instagram" ? env.metaTokenEncryptionKey : env.facebookTokenEncryptionKey ?? env.metaTokenEncryptionKey; if (!key) throw new AdminWorkspaceError(503, "integration_key_unavailable"); return key; }
function providerError(): AdminWorkspaceError { return new AdminWorkspaceError(503, "provider_unavailable"); }

async function subscriptionFields(record: NonNullable<Awaited<ReturnType<typeof rawConnection>>>): Promise<string[]> { const token = unsealSecret(record.accessTokenEncrypted, encryptionKey(record.provider)); const env = getServerEnv(); try { if (record.provider === "instagram") return new MetaClient({ apiVersion: env.metaApiVersion }).getSubscribedFields({ igUserId: record.accountId, accessToken: token }); if (!env.facebookAppId) throw providerError(); return readFacebookPageWebhookSubscription(record.accountId, token, env.facebookApiVersion, env.facebookAppId, undefined, env.facebookAppSecret); } catch { throw providerError(); } }

export async function loadAdminIntegration(provider: AdminIntegrationProvider, id: string): Promise<AdminIntegrationDetail> { const record = await rawConnection(provider, id); if (!record) throw new AdminWorkspaceError(404, "integration_not_found"); let fields: string[] = []; let unavailable = false; try { fields = await subscriptionFields(record); } catch { unavailable = true; } const missing = EXPECTED[provider].filter((field) => !fields.includes(field)); return { id, provider, workspace: { id: record.workspace.id, name: record.workspace.name }, accountId: record.accountId, accountName: record.accountName, status: record.status, version: record.version, tokenExpiry: expiryBucket(record.tokenExpiresAt), tokenExpiresAt: record.tokenExpiresAt?.toISOString() ?? null, connectedAt: record.connectedAt.toISOString(), subscriptionHealth: unavailable ? "unavailable" : missing.length ? "drifted" : "healthy", subscribedFields: fields, missingFields: [...missing], checkedAt: new Date().toISOString(), allowedActions: provider === "instagram" ? ["refresh_token", "mark_expired", "repair_subscription", "disconnect"] : ["mark_expired", "repair_subscription", "disconnect"], ...(unavailable ? { safeErrorCode: "PROVIDER_UNAVAILABLE" } : {}) };
}

export async function executeAdminIntegration(provider: AdminIntegrationProvider, id: string, action: "refresh_token" | "mark_expired" | "repair_subscription" | "disconnect", version: number) { const record = await rawConnection(provider, id); if (!record) throw new AdminWorkspaceError(404, "integration_not_found"); protect(record); const env = getServerEnv();
  if (action === "mark_expired") {
    const result = provider === "instagram"
      ? await prisma.instagramConnection.updateMany({
        where: { id, version },
        data: { status: "EXPIRED", version: { increment: 1 } },
      })
      : await prisma.facebookPageConnection.updateMany({
        where: { id, version },
        data: { status: "EXPIRED", version: { increment: 1 } },
      });
    if (result.count !== 1) throw new AdminWorkspaceError(409, "stale_version");
    return { id, provider, action, version: version + 1 };
  }
  const token = unsealSecret(record.accessTokenEncrypted, encryptionKey(provider));
  if (action === "refresh_token") { if (provider !== "instagram") throw new AdminWorkspaceError(400, "action_not_allowed"); let refreshed: Awaited<ReturnType<typeof refreshInstagramToken>>; try { refreshed = await refreshInstagramToken(token); } catch { throw providerError(); } const expiresAt = refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : record.tokenExpiresAt; const result = await prisma.instagramConnection.updateMany({ where: { id, version }, data: { accessTokenEncrypted: sealSecret(refreshed.accessToken, encryptionKey(provider)), tokenExpiresAt: expiresAt, status: "CONNECTED", version: { increment: 1 } } }); if (result.count !== 1) throw new AdminWorkspaceError(409, "stale_version"); return { id, provider, action, version: version + 1, tokenExpiry: expiryBucket(expiresAt) }; }
  if (action === "repair_subscription") { const current = await subscriptionFields(record); const missing = EXPECTED[provider].filter((field) => !current.includes(field)); if (missing.length) { try { if (provider === "instagram") { const result = await new MetaClient({ apiVersion: env.metaApiVersion }).subscribeToWebhooks({ igUserId: record.accountId, accessToken: token }); if (!result.fields.length) throw providerError(); } else { const result = await subscribeFacebookPageToWebhooks(record.accountId, token, env.facebookApiVersion, undefined, env.facebookAppSecret); if (!result.subscribed) throw providerError(); } } catch { throw providerError(); } } return { id, provider, action, repairedFields: missing, version }; }
  try { if (provider === "instagram") await new MetaClient({ apiVersion: env.metaApiVersion }).unsubscribeFromWebhooks({ igUserId: record.accountId, accessToken: token }); else await unsubscribeFacebookPageFromWebhooks(record.accountId, token, env.facebookApiVersion, undefined, env.facebookAppSecret); } catch { throw providerError(); }
  if (provider === "instagram") await prisma.$transaction(async (tx) => { await tx.automation.updateMany({ where: { workspaceId: record.workspace.id, instagramAccountId: record.accountId }, data: { instagramAccountId: null, status: "PAUSED", version: { increment: 1 } } }); await tx.automationParticipant.updateMany({ where: { workspaceId: record.workspace.id, instagramAccountId: record.accountId }, data: { state: "EXPIRED" } }); const removed = await tx.instagramConnection.deleteMany({ where: { id, version } }); if (removed.count !== 1) throw new AdminWorkspaceError(409, "stale_version"); });
  else await prisma.$transaction(async (tx) => { await tx.automation.updateMany({ where: { workspaceId: record.workspace.id, facebookPageId: record.accountId }, data: { facebookPageId: null, status: "PAUSED", version: { increment: 1 } } }); const removed = await tx.facebookPageConnection.deleteMany({ where: { id, version } }); if (removed.count !== 1) throw new AdminWorkspaceError(409, "stale_version"); });
  return { id, provider, action, disconnected: true };
}
