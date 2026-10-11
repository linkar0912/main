import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import type { DailyVolume, Goal, OnboardingAnswers } from "./answers";

/**
 * The maths behind the onboarding "Your plan" step. Every number here comes
 * from the person's own answers (or, for the post block, from their own
 * Instagram data) multiplied by an assumption that is printed next to it.
 * There are no industry benchmarks or made-up statistics: when we do not
 * know something we say what we assumed, and when there is no data we show
 * nothing.
 */

/** The middle of each daily-volume answer, used as "about N a day". */
export const DAILY_VOLUME_MIDPOINT: Record<DailyVolume, number> = {
  under_10: 6,
  "10_50": 30,
  "50_200": 120,
  "200_1000": 500,
  "1000_plus": 1500,
};

/**
 * Our working assumption for how many messages each goal covers. Stated to
 * the person as "about N in 10", never as a statistic.
 */
const GOAL_SHARE: Record<Goal, number> = {
  faq: 0.35,
  links: 0.3,
  sell: 0.25,
  leads: 0.2,
  giveaways: 0.2,
  grow: 0.15,
  book: 0.1,
};

/** Share used when no goal was picked. */
const DEFAULT_SHARE = 0.3;
const MIN_SHARE = 0.2;
const MAX_SHARE = 0.8;

/** Seconds it takes a person to read and answer one message by hand. */
export const SECONDS_PER_REPLY = { low: 30, high: 45 } as const;
const DAYS_PER_MONTH = 30;
/** A comment-to-DM conversation usually sends a public reply and a DM. */
export const MESSAGES_PER_CONVERSATION = 2;

/**
 * Combined share of messages the chosen goals cover, rounded to the nearest
 * tenth so it can be said as "about N in 10". Goals overlap, so shares
 * combine as 1 - Π(1 - share) rather than adding up past 100%.
 */
export function matchedShare(goals: readonly Goal[] | undefined): number {
  if (!goals || goals.length === 0) return DEFAULT_SHARE;
  const missed = goals.reduce((product, goal) => product * (1 - GOAL_SHARE[goal]), 1);
  const share = Math.min(MAX_SHARE, Math.max(MIN_SHARE, 1 - missed));
  return Math.round(share * 10) / 10;
}

export type TimeBack = {
  /** "time": hours saved; "missed": they mostly don't reply today. */
  kind: "time" | "missed";
  perDay: number;
  /** As a fraction, e.g. 0.6 ("about 6 in 10"). */
  share: number;
  /** Messages a month Linkar could answer for them. */
  handledPerMonth: number;
  minutesLow: number;
  minutesHigh: number;
};

export function estimateTimeBack(answers: Pick<OnboardingAnswers, "dailyVolume" | "goals" | "replyMode">): TimeBack | null {
  if (!answers.dailyVolume) return null;
  const perDay = DAILY_VOLUME_MIDPOINT[answers.dailyVolume];
  const share = matchedShare(answers.goals);
  const handledPerMonth = Math.round(perDay * share * DAYS_PER_MONTH);
  return {
    kind: answers.replyMode === "none" ? "missed" : "time",
    perDay,
    share,
    handledPerMonth,
    minutesLow: Math.round((handledPerMonth * SECONDS_PER_REPLY.low) / 60),
    minutesHigh: Math.round((handledPerMonth * SECONDS_PER_REPLY.high) / 60),
  };
}

/** A range as a person would say it: "40-60 minutes", "9-14 hours", "about 2 hours". */
export function formatDurationRange(minutesLow: number, minutesHigh: number): { low: number; high: number; unit: "minutes" | "hours" } {
  if (minutesHigh < 90) return { low: Math.max(1, Math.round(minutesLow)), high: Math.max(1, Math.round(minutesHigh)), unit: "minutes" };
  const low = Math.max(1, Math.round(minutesLow / 60));
  const high = Math.max(low, Math.round(minutesHigh / 60));
  return { low, high, unit: "hours" };
}

export type PlanFit = {
  key: string;
  name: string;
  monthlyPaise: number;
  monthlyDeliveryLimit: number;
  /** Messages a month we expect Linkar to send for them. */
  estimatedMessages: number;
  /** Why this plan, in plain words. */
  reason: "volume" | "team" | "free";
};

const PLAN_LADDER = [FREE_BILLING_PLAN, BILLING_PLANS.creator, BILLING_PLANS.growth, BILLING_PLANS.agency] as const;

/**
 * The smallest plan whose monthly message allowance covers the estimate (and
 * that has a second seat when a team replies today). The biggest plan is the
 * answer when nothing smaller fits; it is never "upgrade to win".
 */
export function fitPlan(answers: Pick<OnboardingAnswers, "dailyVolume" | "goals" | "replyMode">): PlanFit | null {
  const time = estimateTimeBack(answers);
  if (!time) return null;
  const estimatedMessages = time.handledPerMonth * MESSAGES_PER_CONVERSATION;
  const needsTeam = answers.replyMode === "team";
  const plan = PLAN_LADDER.find((candidate) => candidate.monthlyDeliveryLimit >= estimatedMessages && (!needsTeam || candidate.memberLimit >= 2))
    ?? PLAN_LADDER[PLAN_LADDER.length - 1];
  const fitsFreeOnVolume = FREE_BILLING_PLAN.monthlyDeliveryLimit >= estimatedMessages;
  return {
    key: plan.key,
    name: plan.name,
    monthlyPaise: plan.monthlyPaise,
    monthlyDeliveryLimit: plan.monthlyDeliveryLimit,
    estimatedMessages,
    reason: plan.key === "free" ? "free" : needsTeam && fitsFreeOnVolume ? "team" : "volume",
  };
}

export type PostSample = { commentsCount?: number | null };

export type PostInsight = {
  posts: number;
  comments: number;
  busiest: number;
  /** How many posts crossed a round threshold worth mentioning (200, 100 or 50). */
  over: { threshold: number; count: number } | null;
};

/**
 * Real numbers from their own recent posts. Returns null when the data has
 * no comment counts at all, so the UI shows nothing instead of a zero that
 * pretends to be data.
 */
export function summarisePosts(media: readonly PostSample[], limit = 12): PostInsight | null {
  const counted = media.slice(0, limit).filter((item): item is { commentsCount: number } => typeof item.commentsCount === "number" && item.commentsCount >= 0);
  if (counted.length === 0) return null;
  const comments = counted.reduce((sum, item) => sum + item.commentsCount, 0);
  const busiest = counted.reduce((max, item) => Math.max(max, item.commentsCount), 0);
  const threshold = [200, 100, 50].find((value) => counted.some((item) => item.commentsCount >= value));
  return {
    posts: counted.length,
    comments,
    busiest,
    over: threshold ? { threshold, count: counted.filter((item) => item.commentsCount >= threshold).length } : null,
  };
}
