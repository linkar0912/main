import type { AutomationRepository } from "@/src/lib/repository";
import { resolveInvitation } from "@/src/lib/auth/invitations";
import { provisionWorkspace } from "@/src/lib/auth/provision-workspace";

/**
 * Shared by every OAuth sign-in callback (Google's direct flow, Facebook via
 * Supabase's hosted relay) once the provider has verified the user's email.
 * A returning email just resolves to its existing workspace; a first-time
 * sign-in accepts a matching invite if one exists, otherwise provisions a
 * fresh workspace - same rules password signup follows. Returns the
 * workspace id the caller is now a member of.
 */
export async function completeOAuthSignIn(params: {
  email: string;
  userId: string;
  inviteRaw: string;
  repository: Pick<
    AutomationRepository,
    "findWorkspaceIdByMemberEmail" | "findWorkspaceIdByMemberUserId" | "bindMemberUserId" |
    "findInvitationByTokenHash" | "ensureWorkspace" | "acceptInvitation"
  >;
}): Promise<string> {
  const email = params.email.toLowerCase();
  const stableWorkspaceId = await params.repository.findWorkspaceIdByMemberUserId(params.userId);
  if (stableWorkspaceId) return stableWorkspaceId;
  const existingWorkspaceId = await params.repository.findWorkspaceIdByMemberEmail(email);
  if (existingWorkspaceId) {
    await params.repository.bindMemberUserId(existingWorkspaceId, email, params.userId);
    return existingWorkspaceId;
  }

  // First time this email has signed in. An invalid or missing invite both
  // fall through to a fresh workspace rather than blocking sign-in - unlike
  // password signup, the account already exists by this point, so there's no
  // account creation left to refuse.
  const resolution = await resolveInvitation({ inviteRaw: params.inviteRaw, email, repository: params.repository });
  return provisionWorkspace({
    email,
    userId: params.userId,
    invitation: resolution.status === "valid" ? resolution.invitation : null,
    repository: params.repository,
  });
}
