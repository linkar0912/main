import type { EvaluationContext, FlowCondition, FlowDefinitionV1, NormalizedEvent } from "./types";

/** Trim, lowercase, and strip diacritics so café matches cafe across locales. */
function normalizedText(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function containsKeyword(text: string, keywords: string[]): boolean {
  const candidate = normalizedText(text);
  return keywords.some((keyword) => candidate.includes(normalizedText(keyword)));
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
    if (trigger.match === "keyword" && !containsKeyword(event.text, trigger.keywords)) return false;
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
    if (event.type !== "message.received" && event.type !== "postback.received") return false;
    if (trigger.match === "keyword" && !containsKeyword(event.text, trigger.keywords)) return false;
  }

  return matchesConditions(flow.conditions, event);
}
