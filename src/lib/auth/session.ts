import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getRepository } from "../repository-provider";

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

  const workspaceId = await getRepository().findWorkspaceIdByMemberEmail(data.claims.email);
  if (!workspaceId) return null;

  const session = { userId: data.claims.sub, email: data.claims.email, workspaceId };
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
