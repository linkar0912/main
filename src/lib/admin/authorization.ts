import "server-only";

import { getServerEnv } from "@/src/lib/env";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";

export type PlatformOwnerIdentity = {
  userId: string;
  email: string;
  sessionId: string;
  aal: "aal1" | "aal2";
};

export type PlatformOwnerAuthErrorCode = "unauthorized" | "forbidden" | "mfa_required";

export class PlatformOwnerAuthError extends Error {
  constructor(
    public readonly status: 401 | 403 | 428,
    public readonly code: PlatformOwnerAuthErrorCode,
  ) {
    super(code);
    this.name = "PlatformOwnerAuthError";
  }
}

export function authorizePlatformOwner(
  claims: Record<string, unknown>,
  ownerIds: readonly string[],
  requireAal2: boolean,
): PlatformOwnerIdentity {
  const userId = typeof claims.sub === "string" ? claims.sub.toLowerCase() : "";
  if (!userId) throw new PlatformOwnerAuthError(401, "unauthorized");
  if (!ownerIds.includes(userId)) throw new PlatformOwnerAuthError(403, "forbidden");

  const aal = claims.aal === "aal2" ? "aal2" : "aal1";
  if (requireAal2 && aal !== "aal2") {
    throw new PlatformOwnerAuthError(428, "mfa_required");
  }

  const email = typeof claims.email === "string" ? claims.email : "";
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : "";
  if (!email || !sessionId) throw new PlatformOwnerAuthError(401, "unauthorized");

  return { userId, email, sessionId, aal };
}

async function getVerifiedClaims(): Promise<Record<string, unknown>> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) throw new PlatformOwnerAuthError(401, "unauthorized");
  return data.claims as Record<string, unknown>;
}

export async function getPlatformOwnerIdentity(): Promise<PlatformOwnerIdentity> {
  const claims = await getVerifiedClaims();
  return authorizePlatformOwner(claims, getServerEnv().platformOwnerUserIds, false);
}

export async function getPlatformOwnerSession(): Promise<PlatformOwnerIdentity> {
  const claims = await getVerifiedClaims();
  return authorizePlatformOwner(claims, getServerEnv().platformOwnerUserIds, true);
}
