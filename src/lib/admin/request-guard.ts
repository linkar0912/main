import "server-only";

import { createHmac } from "node:crypto";

import { getServerEnv } from "@/src/lib/env";
import { clientAddress } from "@/src/lib/auth/client-address";
import {
  getPlatformOwnerSession,
  type PlatformOwnerIdentity,
} from "@/src/lib/admin/authorization";

export type AdminRequestErrorCode =
  | "origin_required"
  | "origin_mismatch"
  | "json_required"
  | "reason_required"
  | "invalid_idempotency_key";

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
  const env = getServerEnv();
  const origin = request.headers.get("origin")?.trim();
  if (!origin) throw new AdminRequestError(403, "origin_required");

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new AdminRequestError(403, "origin_mismatch");
  }
  if (normalizedOrigin !== new URL(env.appUrl).origin) {
    throw new AdminRequestError(403, "origin_mismatch");
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new AdminRequestError(415, "json_required");
  }

  const reason = request.headers.get("x-admin-reason")?.trim() ?? "";
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
    requestId: `admin_req_${hmac(env.authSessionSecret, "idempotency", idempotencyKey)}`,
    origin: normalizedOrigin,
    ipHash: hmac(env.authSessionSecret, "client-address", address),
    userAgent: (request.headers.get("user-agent") ?? "unknown").slice(0, 1_000),
  };
}
