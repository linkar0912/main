import type { OnboardingAnswers } from "@/src/lib/onboarding/answers";
import type { OnboardingView } from "@/src/lib/onboarding/view";

export type PreviewVariant = "connected" | "not-connected" | "member";

/** A small fashion and beauty brand, answering in order. */
const OWNER_ANSWERS: Array<[number, OnboardingAnswers]> = [
  [1, { name: "Priya" }],
  [2, { accountType: "brand" }],
  [3, { niches: ["fashion", "beauty"] }],
  [4, { audience: "10k_50k", channels: ["instagram"] }],
  [5, { goals: ["sell", "faq", "links"] }],
  [6, { dailyVolume: "50_200", replyMode: "myself" }],
];

/** Answers given up to and including `step`, so each screen shows a real choice. */
export function answersThrough(step: number): OnboardingAnswers {
  return OWNER_ANSWERS.filter(([at]) => at <= step).reduce<OnboardingAnswers>((all, [, answers]) => ({ ...all, ...answers }), {});
}

/** Comment counts on the connected account's last twelve posts. */
export const PREVIEW_MEDIA = [312, 96, 241, 58, 17, 204, 133, 44, 71, 26, 188, 50].map((commentsCount) => ({ commentsCount }));

export function previewView(variant: PreviewVariant, step: number): OnboardingView {
  const connected = variant === "connected";
  if (variant === "member") {
    return {
      flow: "member",
      step,
      answers: {},
      member: step >= 2 ? { name: "Arjun", ...(step >= 3 ? { focus: "inbox" as const } : {}) } : {},
      completedAt: null,
      skippedAt: null,
      suggestedName: "Arjun",
      canConnect: false,
      connections: { instagram: [], facebook: [] },
    };
  }
  return {
    flow: "owner",
    step,
    answers: answersThrough(step),
    member: {},
    completedAt: null,
    skippedAt: null,
    suggestedName: "Priya",
    canConnect: true,
    connections: {
      instagram: connected ? [{ username: "studio.priya", status: "CONNECTED" }] : [],
      facebook: [],
    },
  };
}
