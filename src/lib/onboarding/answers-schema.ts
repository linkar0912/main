import { z } from "zod";
import {
  ACCOUNT_TYPES,
  AUDIENCE_SIZES,
  CHANNELS,
  DAILY_VOLUMES,
  GOALS,
  MEMBER_FOCUSES,
  NAME_MAX,
  NICHE_OTHER_MAX,
  NICHES,
  REPLY_MODES,
  type OnboardingAnswers,
} from "./answers";

/** Server-side validation of onboarding answers. Kept apart from ./answers so the browser never loads zod. */
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

export const MemberAnswersSchema = z.object({
  name: cleanText(NAME_MAX).optional(),
  focus: z.enum(MEMBER_FOCUSES).optional(),
}).strict();

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
