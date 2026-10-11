import type { OnboardingAnswers } from "./answers";
import { estimateTimeBack, fitPlan, summarisePosts, type PlanFit, type PostInsight, type PostSample, type TimeBack } from "./plan";
import { recommendTemplates, type Recommendation } from "./recommendations";

/** Everything the "Your plan" step shows, computed on the server. */
export type OnboardingPlan = {
  name: string | null;
  timeBack: TimeBack | null;
  /** Only when a connected Instagram account returned comment counts. */
  posts: (PostInsight & { username: string }) | null;
  recommendations: Recommendation[];
  planFit: PlanFit | null;
  /** The workspace's current plan key, so "you're already on it" can be said. */
  currentPlan: string;
};

export function buildOnboardingPlan(input: {
  answers: OnboardingAnswers;
  currentPlan: string;
  instagram?: { username: string; media: readonly PostSample[] } | null;
  facebookPageId?: string;
}): OnboardingPlan {
  const posts = input.instagram ? summarisePosts(input.instagram.media) : null;
  return {
    name: input.answers.name ?? null,
    timeBack: estimateTimeBack(input.answers),
    posts: posts && input.instagram ? { ...posts, username: input.instagram.username } : null,
    recommendations: recommendTemplates(input.answers, 3, { facebookPageId: input.facebookPageId }),
    planFit: fitPlan(input.answers),
    currentPlan: input.currentPlan,
  };
}
