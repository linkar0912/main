import { z } from "zod";

/**
 * First-time onboarding answers (docs: .claude/specs/ONBOARDING_SPEC.md).
 *
 * Every choice is an enum so the server never stores free-form values it
 * cannot reason about; the two free-text fields are trimmed and capped. The
 * same schema runs in the browser (to keep the flow honest) and in
 * /api/onboarding (the source of truth).
 */

export const ACCOUNT_TYPES = ["creator", "brand", "agency", "coach", "other"] as const;
export const NICHES = [
  "fashion", "beauty", "food", "fitness", "education", "tech", "travel", "home", "finance", "entertainment", "other",
] as const;
export const AUDIENCE_SIZES = ["under_1k", "1k_10k", "10k_50k", "50k_200k", "200k_plus"] as const;
export const CHANNELS = ["instagram", "facebook"] as const;
export const GOALS = ["sell", "leads", "faq", "book", "grow", "giveaways", "links"] as const;
export const DAILY_VOLUMES = ["under_10", "10_50", "50_200", "200_1000", "1000_plus"] as const;
export const REPLY_MODES = ["myself", "team", "tool", "none"] as const;
export const MEMBER_FOCUSES = ["inbox", "automations", "reports"] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type Niche = (typeof NICHES)[number];
export type AudienceSize = (typeof AUDIENCE_SIZES)[number];
export type Channel = (typeof CHANNELS)[number];
export type Goal = (typeof GOALS)[number];
export type DailyVolume = (typeof DAILY_VOLUMES)[number];
export type ReplyMode = (typeof REPLY_MODES)[number];
export type MemberFocus = (typeof MEMBER_FOCUSES)[number];

export const NAME_MAX = 40;
export const NICHE_OTHER_MAX = 60;

/** Owner flow: 1 welcome, 2 type, 3 niche, 4 audience, 5 goals, 6 load, 7 connect, 8 plan, 9 done. */
export const OWNER_STEP_COUNT = 9;
/** Member flow: 1 welcome + name, 2 focus, 3 done. */
export const MEMBER_STEP_COUNT = 3;

const cleanText = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().max(max));

/** One de-duplicated list of enum values, at most the enum's size. */
function enumList<const T extends readonly [string, ...string[]]>(values: T) {
  return z.array(z.enum(values)).max(values.length).transform((list) => Array.from(new Set(list)));
}

export const OnboardingAnswersSchema = z.object({
  name: cleanText(NAME_MAX).optional(),
  accountType: z.enum(ACCOUNT_TYPES).optional(),
  niches: enumList(NICHES).optional(),
  nicheOther: cleanText(NICHE_OTHER_MAX).optional(),
  audience: z.enum(AUDIENCE_SIZES).optional(),
  channels: enumList(CHANNELS).optional(),
  goals: enumList(GOALS).optional(),
  dailyVolume: z.enum(DAILY_VOLUMES).optional(),
  replyMode: z.enum(REPLY_MODES).optional(),
}).strict();

export type OnboardingAnswers = z.infer<typeof OnboardingAnswersSchema>;

export const MemberAnswersSchema = z.object({
  name: cleanText(NAME_MAX).optional(),
  focus: z.enum(MEMBER_FOCUSES).optional(),
}).strict();

export type MemberAnswers = z.infer<typeof MemberAnswersSchema>;

/**
 * Reads stored answers defensively: a row written by an older build (or a
 * hand-edited one) never breaks the flow - unknown or invalid fields are
 * simply dropped, valid ones survive.
 */
export function readStoredAnswers(value: unknown): OnboardingAnswers {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const answers: Record<string, unknown> = {};
  const shape = OnboardingAnswersSchema.shape;
  for (const [key, field] of Object.entries(shape)) {
    const raw = (value as Record<string, unknown>)[key];
    if (raw === undefined) continue;
    const parsed = (field as z.ZodType).safeParse(raw);
    if (parsed.success && parsed.data !== undefined) answers[key] = parsed.data;
  }
  return answers as OnboardingAnswers;
}

/** Plain-language labels, shared by the flow, Home and the owner console. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  creator: "Creator",
  brand: "Brand or shop",
  agency: "Agency",
  coach: "Coach or educator",
  other: "Something else",
};

export const NICHE_LABELS: Record<Niche, string> = {
  fashion: "Fashion",
  beauty: "Beauty",
  food: "Food",
  fitness: "Fitness",
  education: "Education",
  tech: "Tech",
  travel: "Travel",
  home: "Home and decor",
  finance: "Finance",
  entertainment: "Entertainment",
  other: "Other",
};

export const AUDIENCE_LABELS: Record<AudienceSize, string> = {
  under_1k: "Under 1k",
  "1k_10k": "1k to 10k",
  "10k_50k": "10k to 50k",
  "50k_200k": "50k to 200k",
  "200k_plus": "200k or more",
};

export const CHANNEL_LABELS: Record<Channel, string> = {
  instagram: "Instagram",
  facebook: "Facebook Page",
};

export const GOAL_LABELS: Record<Goal, string> = {
  sell: "Sell products",
  leads: "Collect emails and leads",
  faq: "Answer common questions",
  book: "Book calls or consultations",
  grow: "Grow followers",
  giveaways: "Run giveaways",
  links: "Send links from comments",
};

export const DAILY_VOLUME_LABELS: Record<DailyVolume, string> = {
  under_10: "Under 10",
  "10_50": "10 to 50",
  "50_200": "50 to 200",
  "200_1000": "200 to 1,000",
  "1000_plus": "More than 1,000",
};

export const REPLY_MODE_LABELS: Record<ReplyMode, string> = {
  myself: "I do it myself",
  team: "My team does",
  tool: "Another tool",
  none: "I mostly don’t",
};

export const MEMBER_FOCUS_LABELS: Record<MemberFocus, string> = {
  inbox: "Reply in the inbox",
  automations: "Build automations",
  reports: "Look at reports",
};
