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

/**
 * Password signup stores the invite token in the new user's metadata, so the
 * invitation can still be accepted after email confirmation even if the
 * confirmation link (or the device it is opened on) lost the `invite` query
 * parameter. Metadata is user-editable, which is fine: resolveInvitation still
 * requires the token hash to match an invitation issued for this exact email.
 */
export const PENDING_INVITE_METADATA_KEY = "pending_invite";

export function pendingInviteFromUser(user: { user_metadata?: Record<string, unknown> } | null | undefined): string {
  const value = user?.user_metadata?.[PENDING_INVITE_METADATA_KEY];
  return typeof value === "string" && value.length <= 512 ? value : "";
}
