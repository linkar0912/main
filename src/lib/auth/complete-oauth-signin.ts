import type { AutomationRepository } from "@/src/lib/repository";
import { resolveInvitation } from "@/src/lib/auth/invitations";
import { provisionWorkspace } from "@/src/lib/auth/provision-workspace";

type CompleteOAuthSignInParams = {
  email: string;
  userId: string;
  inviteRaw: string;
  repository: Pick<
    AutomationRepository,
    "findWorkspaceIdByMemberEmail" | "findWorkspaceIdByMemberUserId" | "bindMemberUserId" |
    "findInvitationByTokenHash" | "ensureWorkspace" | "acceptInvitation"
  >;
};

export type OAuthSignInResult =
  | { status: "signed-in"; workspaceId: string }
  | { status: "invite-invalid" };

/**
 * completeOAuthSignIn, with an opt-in for the OAuth callbacks:
 * `refuseInvalidInvite` turns away a brand-new account that arrived with an
 * invite that does not resolve for its email (sent to another address,
 * expired, revoked or already used) instead of giving it a workspace of its
 * own. That is what happens when an invited teammate signs in with a
 * personal Google or Facebook account. An account that already has a
 * workspace signs in whatever invite came along.
 */
export async function completeOAuthSignInResult(
  params: CompleteOAuthSignInParams & { refuseInvalidInvite: boolean },
): Promise<OAuthSignInResult> {
  const email = params.email.toLowerCase();
  const stableWorkspaceId = await params.repository.findWorkspaceIdByMemberUserId(params.userId);
  if (stableWorkspaceId) return { status: "signed-in", workspaceId: stableWorkspaceId };
  const existingWorkspaceId = await params.repository.findWorkspaceIdByMemberEmail(email);
  if (existingWorkspaceId) {
    await params.repository.bindMemberUserId(existingWorkspaceId, email, params.userId);
    return { status: "signed-in", workspaceId: existingWorkspaceId };
  }

  const resolution = await resolveInvitation({ inviteRaw: params.inviteRaw, email, repository: params.repository });
  if (params.refuseInvalidInvite && params.inviteRaw && resolution.status === "invalid") return { status: "invite-invalid" };
  const workspaceId = await provisionWorkspace({
    email,
    userId: params.userId,
    invitation: resolution.status === "valid" ? resolution.invitation : null,
    repository: params.repository,
  });
  return { status: "signed-in", workspaceId };
}

/**
 * Shared by every sign-in path once the email is verified (password sign-in,
 * email confirmation; the OAuth callbacks use completeOAuthSignInResult).
 * A returning email just resolves to its existing workspace; a first-time
 * sign-in accepts a matching invite if one exists, otherwise provisions a
 * fresh workspace - same rules password signup follows. Returns the
 * workspace id the caller is now a member of.
 */
export async function completeOAuthSignIn(params: CompleteOAuthSignInParams): Promise<string> {
  // First time this email has signed in. An invalid or missing invite both
  // fall through to a fresh workspace rather than blocking sign-in - unlike
  // password signup, the account already exists by this point, so there's no
  // account creation left to refuse.
  const result = await completeOAuthSignInResult({ ...params, refuseInvalidInvite: false });
  if (result.status !== "signed-in") throw new Error("completeOAuthSignIn never refuses an invite");
  return result.workspaceId;
}
