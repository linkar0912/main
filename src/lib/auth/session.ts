import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getRepository } from "../repository-provider";
import type { AutomationRepository } from "../repository";

export type AppSession = {
  userId: string;
  email: string;
  workspaceId: string;
};

export type ApplicationSessionValidationInput = AppSession & {
  claims: Record<string, unknown>;
};

export type GetValidatedSessionOptions = {
  validateApplicationSession?: (
    input: ApplicationSessionValidationInput,
  ) => boolean | Promise<boolean>;
};

type ApplicationAccessRepository = Pick<
  AutomationRepository,
  "listWorkspaceMembershipsByUserId" | "findWorkspaceIdByMemberEmail" | "bindMemberUserId" | "getApplicationAccessState"
>;

export async function assertApplicationAccess(
  userId: string,
  email: string,
  issuedAt: number | null,
  repository: ApplicationAccessRepository = getRepository(),
): Promise<{ workspaceId: string; email: string } | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const memberships = await repository.listWorkspaceMembershipsByUserId(userId);
  let membership = memberships[0];

  if (!membership) {
    const workspaceId = await repository.findWorkspaceIdByMemberEmail(normalizedEmail);
    if (!workspaceId) return null;
    const bound = await repository.bindMemberUserId(workspaceId, normalizedEmail, userId);
    if (!bound) return null;
    membership = { id: "backfilled", workspaceId, email: normalizedEmail, role: "MEMBER", userId };
  }

  const access = await repository.getApplicationAccessState(userId, membership.workspaceId);
  if (!access || access.userStatus !== "ACTIVE" || access.workspaceStatus !== "ACTIVE") return null;
  if (access.sessionInvalidBefore) {
    if (issuedAt === null || issuedAt * 1000 < Date.parse(access.sessionInvalidBefore)) return null;
  }
  return { workspaceId: membership.workspaceId, email: membership.email.toLowerCase() };
}

/**
 * Verifies the Supabase session cookie and resolves it to this app's
 * {userId, workspaceId} shape. getClaims() verifies the JWT locally against
 * the project's cached JWKS (no network round-trip) since the project uses
 * asymmetric signing keys, refreshing first if the access token is close to
 * expiry. workspaceId is derived per-request from team membership (keyed by
 * email) rather than embedded in the token, since Supabase doesn't expose a
 * custom session claim shape without extra setup.
 *
 * The `_request` parameter is reserved for symmetry with how route handlers
 * are typed (`(request: Request, context) => …`) and so a future change to
 * pull additional context (IP-bound rate limiting, request-scoped caches,
 * etc.) doesn't need to update every call site. It is intentionally unused
 * today - cookie reads happen via createSupabaseServerClient() which calls
 * next/headers cookies() itself.
 */
export async function getValidatedSession(
  _request: Request,
  options: GetValidatedSessionOptions = {},
): Promise<AppSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub || !data.claims.email) return null;

  const userId = String(data.claims.sub);
  const email = String(data.claims.email);
  const issuedAt = typeof data.claims.iat === "number" ? data.claims.iat : null;
  const access = await assertApplicationAccess(userId, email, issuedAt);
  if (!access) return null;

  const session = { userId, email: access.email, workspaceId: access.workspaceId };
  const allowed = await (options.validateApplicationSession?.({
    ...session,
    claims: data.claims as Record<string, unknown>,
  }) ?? true);

  return allowed ? session : null;
}

function hasBackslashOrControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || value[i] === "\\") return true;
  }
  return false;
}

export function safeNextPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && !hasBackslashOrControlChar(value)
    ? value
    : "/dashboard";
}
