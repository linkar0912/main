import type { CommentTrigger, EvaluationContext, FlowCondition, FlowDefinitionV1, MessageTrigger, NormalizedEvent } from "./types";

/** Trim, lowercase, and strip diacritics so café matches cafe across locales. */
function normalizedText(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const candidate = normalizedText(text);
  return keywords.some((keyword) => candidate.includes(normalizedText(keyword)));
}

/**
 * Evaluate the comment / message trigger's keyword list using the configured
 * match mode. "any" (the default) treats keywords as a bag of needles, "all"
 * requires every keyword to appear, "exact" matches the trimmed lowercased
 * text, "regex" interprets each entry as a regex (bounded to 200 chars to
 * avoid ReDoS), and "contains" is a substring check.
 */
function matchesKeywordsWithMode(
  text: string | undefined,
  keywords: string[],
  mode: "any" | "all" | "exact" | "regex" | "contains" | undefined,
): boolean {
  if (!text) return false;
  const candidate = normalizedText(text);
  const normalizedKeywords = keywords.map((keyword) => keyword.trim()).filter(Boolean);
  if (normalizedKeywords.length === 0) return false;
  const effectiveMode = mode ?? "any";
  if (effectiveMode === "contains") {
    return containsKeyword(text, keywords);
  }
  if (effectiveMode === "exact") {
    return normalizedKeywords.some((keyword) => normalizedText(keyword) === candidate);
  }
  if (effectiveMode === "regex") {
    return normalizedKeywords.some((keyword) => {
      if (keyword.length === 0 || keyword.length > 200) return false;
      try {
        return new RegExp(keyword, "i").test(text);
      } catch {
        return false;
      }
    });
  }
  if (effectiveMode === "all") {
    return normalizedKeywords.every((keyword) => candidate.includes(normalizedText(keyword)));
  }
  return containsKeyword(text, keywords);
}

/** Returns true if `text` contains any of the negative keywords (case-insensitive). */
function matchesNegative(text: string | undefined, negativeKeywords: string[] | undefined): boolean {
  if (!text || !negativeKeywords || negativeKeywords.length === 0) return false;
  const candidate = normalizedText(text);
  return negativeKeywords.some((keyword) => candidate.includes(normalizedText(keyword)));
}

/** The first keyword that appears in `text` (normalized), for {keyword} personalization. */
export function findMatchedKeyword(text: string | undefined, keywords: string[]): string | undefined {
  if (!text) return undefined;
  const candidate = normalizedText(text);
  return keywords.find((keyword) => candidate.includes(normalizedText(keyword)));
}

/** Per-media override for the private reply, when the trigger carries a map. */
export function resolveReplyForMedia(
  trigger: CommentTrigger,
  mediaId: string | undefined,
): string | undefined {
  if (!trigger.replyPerMedia || !mediaId) return undefined;
  return trigger.replyPerMedia[mediaId];
}

function matchesConditions(conditions: FlowCondition[], event: NormalizedEvent): boolean {
  return conditions.every((condition) => {
    if (condition.type === "contains_keyword") {
      return containsKeyword(event.text, condition.keywords);
    }
    return Boolean(event.mediaId && condition.mediaIds.includes(event.mediaId));
  });
}

/** Inbound DM-side events a person can use to start a conversation with the account. */
const CONVERSATION_EVENT_TYPES: NormalizedEvent["type"][] = [
  "message.received",
  "quick_reply.received",
  "postback.received",
  "optin.received",
  "referral.received",
  "story_mention.received",
];

export function matchesTrigger(
  flow: FlowDefinitionV1,
  event: NormalizedEvent,
  context: EvaluationContext = {},
): boolean {
  const trigger = flow.trigger;

  if (trigger.type === "comment") {
    if (event.type !== "comment.created") return false;
    if (trigger.mediaIds.length > 0 && (!event.mediaId || !trigger.mediaIds.includes(event.mediaId))) {
      return false;
    }
    if (trigger.match === "keyword"
      && !matchesKeywordsWithMode(event.text, trigger.keywords, trigger.mode)) return false;
    if (matchesNegative(event.text, trigger.negativeKeywords)) return false;
  } else if (trigger.type === "referral") {
    if (event.type !== "referral.received") return false;
  } else if (trigger.type === "optin") {
    if (event.type !== "optin.received") return false;
  } else if (trigger.type === "story_mention") {
    if (event.type !== "story_mention.received") return false;
  } else if (trigger.type === "first_contact") {
    if (!context.isNewContact) return false;
    if (!CONVERSATION_EVENT_TYPES.includes(event.type)) return false;
  } else {
    const messageTrigger = trigger as MessageTrigger;
    if (event.type !== "message.received" && event.type !== "postback.received") return false;
    if (messageTrigger.match === "keyword"
      && !matchesKeywordsWithMode(event.text, messageTrigger.keywords, messageTrigger.mode)) return false;
  }

  return matchesConditions(flow.conditions, event);
}
