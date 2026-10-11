import { basicAutomationTemplates, type PremadeTemplate, type TemplateTriggerType } from "@/src/lib/automation/templates";
import { GOAL_LABELS, type AccountType, type Goal, type Niche, type OnboardingAnswers } from "./answers";

/**
 * Ranks the existing template catalogue (the same one the template picker
 * shows) against someone's onboarding answers. Pure and deterministic so the
 * plan step, Home and the picker always agree, and so it is unit-tested.
 *
 * Scoring: what they want from their DMs (goals) carries the most weight,
 * then what kind of account they run, then their niche. "Popular" only breaks
 * ties. Picks are spread across trigger types so three recommendations are
 * three different jobs, not three ways to answer a comment.
 */

/** The follow-gated quick-start lives in the picker, not the recipe list. */
export const FOLLOW_GATE_ID = "campaign-follow-gate";

type Candidate = {
  id: string;
  title: string;
  description: string;
  trigger: TemplateTriggerType;
  provider: "INSTAGRAM" | "FACEBOOK";
  popular: boolean;
};

const followGateCandidate: Candidate = {
  id: FOLLOW_GATE_ID,
  title: "Send a link after someone follows you",
  description: "Ask people to follow you before Linkar sends the link they requested.",
  trigger: "comment",
  provider: "INSTAGRAM",
  popular: true,
};

const GOAL_WEIGHTS: Record<Goal, Record<string, number>> = {
  sell: { "price-list-responder": 3, "affiliate-link": 3, "offer-followup": 2, "comment-link-dm": 2, "facebook-product-pricing-faq": 3, "facebook-keyword-comment-reply": 1 },
  leads: { "email-capture": 3, "lead-magnet-comment": 3, "event-registration": 1, "influencer-collab-intake": 1, "facebook-support-acknowledgement": 1 },
  faq: { "conversation-starters": 3, "default-reply": 2, "main-menu": 2, "course-faq-booking": 1, "facebook-product-pricing-faq": 2, "facebook-availability-hours": 2 },
  book: { "course-faq-booking": 3, "event-registration": 2, "email-capture": 1, "facebook-availability-hours": 1 },
  grow: { [FOLLOW_GATE_ID]: 3, "story-mention-reply": 2, "welcome-new-followers": 2, "comment-catch-all": 1, "facebook-every-comment-reply": 2 },
  giveaways: { "giveaway-comment-entry": 3, "giveaway-entry": 2, "facebook-giveaway-acknowledgement": 3 },
  links: { "comment-link-dm": 3, "lead-magnet-comment": 2, "story-reply-link": 2, "comment-catch-all": 1, "facebook-keyword-comment-reply": 2, "facebook-per-post-campaign-reply": 2 },
};

const TYPE_WEIGHTS: Record<AccountType, Record<string, number>> = {
  creator: { "comment-link-dm": 1, "story-mention-reply": 1, "influencer-collab-intake": 1, [FOLLOW_GATE_ID]: 1 },
  brand: { "price-list-responder": 1, "offer-followup": 1, "conversation-starters": 1, "facebook-product-pricing-faq": 1 },
  agency: { "main-menu": 1, "default-reply": 1, "conversation-starters": 1, "facebook-support-acknowledgement": 1 },
  coach: { "course-faq-booking": 2, "event-registration": 1, "lead-magnet-comment": 1 },
  other: {},
};

const NICHE_WEIGHTS: Record<Niche, Record<string, number>> = {
  fashion: { "price-list-responder": 1, "affiliate-link": 1 },
  beauty: { "price-list-responder": 1, "affiliate-link": 1 },
  food: { "main-menu": 1, "conversation-starters": 1, "facebook-availability-hours": 1 },
  fitness: { "course-faq-booking": 1, "lead-magnet-comment": 1 },
  education: { "course-faq-booking": 1, "event-registration": 1 },
  tech: { "affiliate-link": 1, "comment-link-dm": 1 },
  travel: { "conversation-starters": 1, "story-reply-link": 1 },
  home: { "price-list-responder": 1, "affiliate-link": 1 },
  finance: { "lead-magnet-comment": 1, "event-registration": 1 },
  entertainment: { "giveaway-comment-entry": 1, "story-mention-reply": 1 },
  other: {},
};

/** One plain line per template: what it does for this person. */
const FIT_LINES: Record<string, string> = {
  [FOLLOW_GATE_ID]: "turns comments into new followers before they get your link",
  "comment-link-dm": "sends your link the moment someone comments your word",
  "conversation-starters": "answers the questions you get every day with tap-to-reply buttons",
  "email-capture": "asks for an email in the chat and saves it to Contacts",
  "welcome-new-followers": "greets everyone who messages you for the first time",
  "story-mention-reply": "thanks people who mention you in their Story",
  "story-reply-link": "sends a link when someone replies to your Story",
  "default-reply": "makes sure no message goes without a reply",
  "main-menu": "gives people a menu of your most useful pages",
  "comment-catch-all": "replies to every comment on the post you choose",
  "referral-welcome": "welcomes people who arrive from your ads",
  "optin-confirmation": "confirms a button tap and shares the next step",
  "giveaway-entry": "confirms giveaway entries in messages",
  "affiliate-link": "sends your shop or affiliate link when someone wants to buy",
  "lead-magnet-comment": "sends your free guide to everyone who comments for it",
  "price-list-responder": "sends prices and your catalogue when someone asks",
  "course-faq-booking": "answers course questions and shares your booking link",
  "event-registration": "registers people for your event inside the chat",
  "influencer-collab-intake": "collects brand and collab enquiries for you",
  "giveaway-comment-entry": "confirms every giveaway comment privately",
  "offer-followup": "sends your offer and a reminder a day later",
  "facebook-keyword-comment-reply": "answers Page comments that use the words you choose",
  "facebook-every-comment-reply": "replies to every new comment on your Page",
  "facebook-product-pricing-faq": "answers price and product questions under the comment",
  "facebook-availability-hours": "answers questions about your hours",
  "facebook-giveaway-acknowledgement": "confirms giveaway comments on your Page",
  "facebook-support-acknowledgement": "lets people know their question was seen",
  "facebook-per-post-campaign-reply": "replies on the one post you are promoting",
};

export type Recommendation = {
  id: string;
  title: string;
  description: string;
  trigger: TemplateTriggerType;
  provider: "INSTAGRAM" | "FACEBOOK";
  /** "Fits “Sell products”: sends prices…" - why it was picked, in one line. */
  why: string;
  /** Opens the builder prefilled exactly like the template picker does. */
  href: string;
  score: number;
  /** The goal this pick mostly serves, when it serves one. */
  goal: Goal | null;
};

function candidates(provider: "INSTAGRAM" | "FACEBOOK"): Candidate[] {
  const recipes = basicAutomationTemplates
    .filter((template: PremadeTemplate) => template.provider === provider)
    .map((template) => ({
      id: template.id,
      title: template.title,
      description: template.description,
      trigger: template.setup.definition.trigger.type,
      provider: template.provider,
      popular: Boolean(template.popular),
    }));
  return provider === "INSTAGRAM" ? [followGateCandidate, ...recipes] : recipes;
}

/** Instagram unless the person only runs a Facebook Page. */
export function recommendationProvider(answers: Pick<OnboardingAnswers, "channels">): "INSTAGRAM" | "FACEBOOK" {
  const channels = answers.channels ?? [];
  return channels.length === 1 && channels[0] === "facebook" ? "FACEBOOK" : "INSTAGRAM";
}

/** The builder URL the template picker would open for this template. */
export function templateHref(id: string, provider: "INSTAGRAM" | "FACEBOOK", facebookPageId?: string): string {
  if (id === FOLLOW_GATE_ID) return "/automations/new?type=campaign";
  if (provider === "FACEBOOK") {
    const connection = facebookPageId ? `&connection=${encodeURIComponent(facebookPageId)}` : "";
    return `/automations/new?type=classic&template=${id}&provider=facebook&surface=comment${connection}`;
  }
  return `/automations/new?type=classic&template=${id}`;
}

function scoreOf(id: string, answers: OnboardingAnswers): { score: number; goal: Goal | null } {
  let score = 0;
  let goal: Goal | null = null;
  let goalScore = 0;
  for (const picked of answers.goals ?? []) {
    const weight = GOAL_WEIGHTS[picked][id] ?? 0;
    score += weight;
    if (weight > goalScore) {
      goalScore = weight;
      goal = picked;
    }
  }
  if (answers.accountType) score += TYPE_WEIGHTS[answers.accountType][id] ?? 0;
  for (const niche of answers.niches ?? []) score += NICHE_WEIGHTS[niche][id] ?? 0;
  return { score, goal };
}

/**
 * Every template for the person's main channel, best fit first. Ties keep
 * "Popular" first, then catalogue order. The picker uses this ordering.
 */
export function rankTemplates(answers: OnboardingAnswers, options: { facebookPageId?: string } = {}): Recommendation[] {
  const provider = recommendationProvider(answers);
  return candidates(provider)
    .map((candidate, index) => {
      const { score, goal } = scoreOf(candidate.id, answers);
      const fit = FIT_LINES[candidate.id] ?? candidate.description;
      const why = goal ? `Fits “${GOAL_LABELS[goal]}”: ${fit}.` : `${fit.charAt(0).toUpperCase()}${fit.slice(1)}.`;
      return {
        recommendation: {
          id: candidate.id,
          title: candidate.title,
          description: candidate.description,
          trigger: candidate.trigger,
          provider: candidate.provider,
          why,
          href: templateHref(candidate.id, provider, options.facebookPageId),
          score: score + (candidate.popular ? 0.5 : 0),
          goal,
        },
        index,
      };
    })
    .sort((a, b) => b.recommendation.score - a.recommendation.score || a.index - b.index)
    .map(({ recommendation }) => recommendation);
}

/**
 * The top `count` templates, spread across jobs: once a goal is covered,
 * other templates that mainly serve it lose two points, and once a trigger
 * type is used, others of that type lose one. So someone who wants to sell,
 * answer questions and send links gets one pick for each.
 */
export function recommendTemplates(answers: OnboardingAnswers, count = 3, options: { facebookPageId?: string } = {}): Recommendation[] {
  const ranked = rankTemplates(answers, options);
  const picked: Recommendation[] = [];
  const usedTriggers = new Map<TemplateTriggerType, number>();
  const usedGoals = new Map<Goal, number>();
  const pool = [...ranked];
  while (picked.length < count && pool.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    pool.forEach((item, index) => {
      const adjusted = item.score - (usedTriggers.get(item.trigger) ?? 0) - (item.goal ? (usedGoals.get(item.goal) ?? 0) * 2 : 0);
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIndex = index;
      }
    });
    const [best] = pool.splice(bestIndex, 1);
    picked.push(best);
    usedTriggers.set(best.trigger, (usedTriggers.get(best.trigger) ?? 0) + 1);
    if (best.goal) usedGoals.set(best.goal, (usedGoals.get(best.goal) ?? 0) + 1);
  }
  return picked;
}
