import type { MemberAnswers, OnboardingAnswers } from "./answers";
import type { OnboardingFlow } from "./status";

/** GET /api/onboarding - what the flow needs to resume where the person left off. */
export type OnboardingView = {
  flow: OnboardingFlow;
  step: number;
  answers: OnboardingAnswers;
  member: MemberAnswers;
  completedAt: string | null;
  skippedAt: string | null;
  /** First name guessed from the email, to prefill "what should we call you". */
  suggestedName: string | null;
  /** Owners and admins can connect accounts; members cannot. */
  canConnect: boolean;
  connections: {
    instagram: Array<{ username: string; status: string }>;
    facebook: Array<{ pageId: string; pageName: string; status: string }>;
  };
};

/** PUT /api/onboarding actions besides plain answer saves. */
export const ONBOARDING_ACTIONS = ["complete", "skip", "dismiss-invite", "dismiss-plan"] as const;
export type OnboardingAction = (typeof ONBOARDING_ACTIONS)[number];
