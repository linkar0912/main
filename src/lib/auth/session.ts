import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { getRepository } from "../repository-provider";

export type AppSession = {
  userId: string;
  email: string;
  workspaceId: string;
};

/**
 * Verifies the Supabase session cookie and resolves it to this app's
 * {userId, workspaceId} shape. getClaims() verifies the JWT locally against
 * the project's cached JWKS (no network round-trip) since the project uses
 * asymmetric signing keys, refreshing first if the access token is close to
 * expiry. workspaceId is derived per-request from team membership (keyed by
 * email) rather than embedded in the token, since Supabase doesn't expose a
 * custom session claim shape without extra setup.
 */
export async function getValidatedSession(_request: Request): Promise<AppSession | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub || !data.claims.email) return null;

  const workspaceId = await getRepository().findWorkspaceIdByMemberEmail(data.claims.email);
  if (!workspaceId) return null;

  return { userId: data.claims.sub, email: data.claims.email, workspaceId };
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
