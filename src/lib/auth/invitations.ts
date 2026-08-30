import { hashToken } from "@/src/lib/auth/tokens";
import type { AutomationRepository, InvitationRecord } from "@/src/lib/repository";

export type InvitationResolution =
  | { status: "none" }
  | { status: "invalid" }
  | { status: "valid"; invitation: InvitationRecord };

/**
 * Shared by password signup and OAuth signup so both apply the same invite
 * rules: the token must match, be unaccepted, unrevoked, unexpired, and
 * issued for the exact email that's signing up.
 */
export async function resolveInvitation(params: {
  inviteRaw: string;
  email: string;
  repository: Pick<AutomationRepository, "findInvitationByTokenHash">;
}): Promise<InvitationResolution> {
  if (!params.inviteRaw) return { status: "none" };

  const invitation = await params.repository.findInvitationByTokenHash(hashToken(params.inviteRaw));
  const valid = Boolean(
    invitation
    && !invitation.acceptedAt
    && !invitation.revokedAt
    && invitation.email === params.email
    && invitation.expiresAt > new Date().toISOString(),
  );
  return valid ? { status: "valid", invitation: invitation! } : { status: "invalid" };
}
