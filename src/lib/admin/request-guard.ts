import "server-only";

import { createHmac } from "node:crypto";

import { getServerEnv } from "@/src/lib/env";
import { clientAddress } from "@/src/lib/auth/client-address";
import {
  getPlatformOwnerIdentity,
  getPlatformOwnerSession,
  type PlatformOwnerIdentity,
} from "@/src/lib/admin/authorization";
import { currentAdminKeyPrincipal } from "@/src/lib/admin/mcp/principal";

export type AdminRequestErrorCode =
  | "origin_required"
  | "origin_mismatch"
  | "json_required"
  | "reason_required"
  | "invalid_idempotency_key"
  | "mcp_key_read_only"
  | "mcp_key_not_allowed";

export class AdminRequestError extends Error {
  constructor(
    public readonly status: 403 | 415 | 422,
    public readonly code: AdminRequestErrorCode,
  ) {
    super(code);
    this.name = "AdminRequestError";
  }
}

export type AdminWriteOptions = {
  action: string;
  targetType: string;
  targetId: string;
  workspaceId?: string;
};

export type AdminWriteContext = AdminWriteOptions & {
  owner: PlatformOwnerIdentity;
  reason: string;
  idempotencyKey: string;
  requestId: string;
  origin: string;
  ipHash: string;
  userAgent: string;
};

/** Clients percent-encode the reason so non-Latin-1 text survives the header. */
function decodeAdminReason(header: string | null): string {
  if (!header) return "";
  try {
    return decodeURIComponent(header).trim();
  } catch {
    throw new AdminRequestError(422, "reason_required");
  }
}

function hmac(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret).update(`${purpose}\0${value}`).digest("hex");
}

export async function requireAdminRead(_request: Request): Promise<PlatformOwnerIdentity> {
  return getPlatformOwnerSession();
}

export async function requireAdminWrite(
  request: Request,
  options: AdminWriteOptions,
): Promise<AdminWriteContext> {
  const owner = await getPlatformOwnerSession();
  return buildAdminWriteContext(request, options, owner);
}

/** For actions an MCP key must never take, such as minting or revoking keys. */
export async function requireAdminSessionRead(request: Request): Promise<PlatformOwnerIdentity> {
  if (currentAdminKeyPrincipal()) throw new AdminRequestError(403, "mcp_key_not_allowed");
  return requireAdminRead(request);
}

export async function requireAdminSessionWrite(
  request: Request,
  options: AdminWriteOptions,
): Promise<AdminWriteContext> {
  if (currentAdminKeyPrincipal()) throw new AdminRequestError(403, "mcp_key_not_allowed");
  return requireAdminWrite(request, options);
}

export async function requireAdminIdentityWrite(
  request: Request,
  options: AdminWriteOptions,
): Promise<AdminWriteContext> {
  const owner = await getPlatformOwnerIdentity();
  return buildAdminWriteContext(request, options, owner);
}

function buildAdminWriteContext(
  request: Request,
  options: AdminWriteOptions,
  owner: PlatformOwnerIdentity,
): AdminWriteContext {
  const env = getServerEnv();
  const principal = currentAdminKeyPrincipal();
  if (principal?.scope === "READ") throw new AdminRequestError(403, "mcp_key_read_only");

  // The Origin check stops a browser on another site from using the owner's
  // ambient cookies. An MCP key is an explicit bearer credential, not an
  // ambient one, so its calls carry no Origin and are recorded as "mcp".
  let normalizedOrigin = "mcp";
  if (!principal) {
    const origin = request.headers.get("origin")?.trim();
    if (!origin) throw new AdminRequestError(403, "origin_required");
    try {
      normalizedOrigin = new URL(origin).origin;
    } catch {
      throw new AdminRequestError(403, "origin_mismatch");
    }
    if (normalizedOrigin !== new URL(env.adminUrl ?? env.appUrl).origin) {
      throw new AdminRequestError(403, "origin_mismatch");
    }
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.split(";")[0].trim() !== "application/json") {
    throw new AdminRequestError(415, "json_required");
  }

  const reason = decodeAdminReason(request.headers.get("x-admin-reason"));
  if (reason.length < 3 || reason.length > 500) {
    throw new AdminRequestError(422, "reason_required");
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    throw new AdminRequestError(422, "invalid_idempotency_key");
  }

  const address = clientAddress(request, env.trustedProxyHops);
  return {
    ...options,
    owner,
    reason,
    idempotencyKey,
    requestId: `admin_req_${hmac(env.authSessionSecret, "idempotency", JSON.stringify([owner.userId, owner.sessionId, options.action, options.targetType, options.targetId, options.workspaceId ?? null, idempotencyKey]))}`,
    origin: normalizedOrigin,
    ipHash: hmac(env.authSessionSecret, "client-address", address),
    userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 1_000),
  };
}
