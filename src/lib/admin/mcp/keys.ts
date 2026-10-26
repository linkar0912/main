import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { AdminMcpKey } from "@prisma/client";

import type { PlatformOwnerIdentity } from "@/src/lib/admin/authorization";
import { getServerEnv } from "@/src/lib/env";
import { createId } from "@/src/lib/id";
import { logger } from "@/src/lib/logger";
import { prisma } from "@/src/lib/prisma";
import { getRepository } from "@/src/lib/repository-provider";

import type { AdminKeyPrincipal, AdminMcpKeyScope } from "./principal";

const TOKEN_PREFIX = "lkadm_";
const TOKEN_PATTERN = /^lkadm_[A-Za-z0-9_-]{43}$/;
const DISPLAY_PREFIX_LENGTH = 12;
const LAST_USED_RESOLUTION_MS = 60_000;
const LIST_LIMIT = 50;

export const MCP_KEY_TTL_DAYS = [1, 7, 30, 90] as const;
export type AdminMcpKeyTtlDays = typeof MCP_KEY_TTL_DAYS[number];
export const MAX_ACTIVE_MCP_KEYS = 10;

export type AdminMcpKeySummary = {
  id: string;
  label: string;
  scope: AdminMcpKeyScope;
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED";
};

export type AdminMcpKeyErrorCode = "invalid_mcp_key" | "mcp_key_not_found" | "mcp_key_limit";

export class AdminMcpKeyError extends Error {
  constructor(
    public readonly status: 401 | 404 | 409,
    public readonly code: AdminMcpKeyErrorCode,
  ) {
    super(code);
    this.name = "AdminMcpKeyError";
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function summarize(row: AdminMcpKey, now: Date): AdminMcpKeySummary {
  return {
    id: row.id,
    label: row.label,
    scope: row.scope,
    tokenPrefix: row.tokenPrefix,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    status: row.revokedAt ? "REVOKED" : row.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : "ACTIVE",
  };
}

export async function mintAdminMcpKey(
  input: { owner: PlatformOwnerIdentity; label: string; scope: AdminMcpKeyScope; ttlDays: AdminMcpKeyTtlDays },
  now = new Date(),
): Promise<{ key: AdminMcpKeySummary; token: string }> {
  // A soft cap: two simultaneous mints can both pass it, which only lets an
  // owner hold one extra key.
  const active = await prisma.adminMcpKey.count({
    where: { ownerUserId: input.owner.userId, revokedAt: null, expiresAt: { gt: now } },
  });
  if (active >= MAX_ACTIVE_MCP_KEYS) throw new AdminMcpKeyError(409, "mcp_key_limit");

  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const row = await prisma.adminMcpKey.create({
    data: {
      id: createId("mcpkey"),
      ownerUserId: input.owner.userId,
      ownerEmail: input.owner.email,
      label: input.label,
      scope: input.scope,
      tokenHash: sha256(token),
      tokenPrefix: token.slice(0, DISPLAY_PREFIX_LENGTH),
      expiresAt: new Date(now.getTime() + input.ttlDays * 86_400_000),
    },
  });
  return { key: summarize(row, now), token };
}

export async function listAdminMcpKeys(ownerUserId: string, now = new Date()): Promise<AdminMcpKeySummary[]> {
  const rows = await prisma.adminMcpKey.findMany({ where: { ownerUserId }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT });
  return rows.map((row) => summarize(row, now));
}

export async function revokeAdminMcpKey(
  input: { id: string; ownerUserId: string },
  now = new Date(),
): Promise<AdminMcpKeySummary> {
  const row = await prisma.adminMcpKey.findUnique({ where: { id: input.id } });
  if (!row || row.ownerUserId !== input.ownerUserId) throw new AdminMcpKeyError(404, "mcp_key_not_found");
  if (row.revokedAt) return summarize(row, now);
  return summarize(await prisma.adminMcpKey.update({ where: { id: row.id }, data: { revokedAt: now } }), now);
}

/**
 * Every failure is the same 401 so a caller cannot tell a revoked key from a
 * mistyped one. The owner checks repeat the console's on every request: a key
 * stops working as soon as its owner leaves the allowlist, is suspended, or
 * signs out everywhere.
 */
export async function authenticateAdminMcpKey(token: string, now = new Date()): Promise<AdminKeyPrincipal> {
  const invalid = () => new AdminMcpKeyError(401, "invalid_mcp_key");
  if (!TOKEN_PATTERN.test(token)) throw invalid();

  const row = await prisma.adminMcpKey.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.revokedAt || row.expiresAt.getTime() <= now.getTime()) throw invalid();

  const ownerUserId = row.ownerUserId.toLowerCase();
  if (!getServerEnv().platformOwnerUserIds.includes(ownerUserId)) throw invalid();
  const control = await getRepository().getPlatformUserControlState(ownerUserId);
  if (control.status !== "ACTIVE") throw invalid();
  if (control.sessionInvalidBefore && row.createdAt.getTime() < Date.parse(control.sessionInvalidBefore)) throw invalid();

  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
    try {
      await prisma.adminMcpKey.updateMany({ where: { id: row.id, revokedAt: null }, data: { lastUsedAt: now } });
    } catch (error) {
      logger.warn("Could not record MCP key use", { keyId: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    keyId: row.id,
    label: row.label,
    scope: row.scope,
    expiresAt: row.expiresAt.toISOString(),
    owner: { userId: ownerUserId, email: row.ownerEmail, sessionId: `mcp_key:${row.id}`, aal: "aal2" },
  };
}
