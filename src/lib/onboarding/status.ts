import type { MemberOnboardingRecord, MemberRole, WorkspaceOnboardingRecord } from "@/src/lib/repository";
import { readStoredAnswers, type Goal } from "./answers";

export type OnboardingFlow = "owner" | "member";

/**
 * What the app shell and Home need to know about onboarding, carried on the
 * workspace bootstrap so deciding whether to redirect costs no extra request.
 */
export type OnboardingSummary = {
  /** Send this person into /onboarding before the app. */
  required: boolean;
  flow: OnboardingFlow;
  /** Home shows the one-time "Tell us about your account" card. */
  invite: boolean;
  /** Home shows the "Your plan" card built from the answers. */
  planCard: boolean;
  /** Saved goals, for "Recommended for you" on Home and in the template picker. */
  goals: Goal[];
  /** The name they asked to be called, when they gave one. */
  displayName: string | null;
};

/**
 * Owners: a workspace with no onboarding row is new and must onboard; a row
 * backfilled for an existing workspace never forces it (Home invites instead);
 * skipping or finishing releases the redirect. Invited team members get the
 * short flow on the same terms, keyed by their own row.
 */
export function deriveOnboardingSummary(input: {
  role: MemberRole | null;
  workspace: WorkspaceOnboardingRecord | null;
  member: MemberOnboardingRecord | null;
}): OnboardingSummary {
  const flow: OnboardingFlow = input.role === "OWNER" ? "owner" : "member";
  const answers = readStoredAnswers(input.workspace?.answers);
  const goals = answers.goals ?? [];
  const displayName = input.member?.displayName ?? (flow === "owner" ? answers.name ?? null : null);

  if (flow === "owner") {
    const workspace = input.workspace;
    if (!workspace) return { required: true, flow, invite: false, planCard: false, goals, displayName };
    if (workspace.completedAt) {
      return { required: false, flow, invite: false, planCard: !workspace.planDismissedAt, goals, displayName };
    }
    const released = Boolean(workspace.skippedAt) || workspace.existingWorkspace;
    return {
      required: !released,
      flow,
      invite: released && !workspace.inviteDismissedAt,
      planCard: false,
      goals,
      displayName,
    };
  }

  const member = input.member;
  const required = !member || (!member.completedAt && !member.skippedAt && !member.existingMember);
  return { required, flow, invite: false, planCard: false, goals, displayName };
}
