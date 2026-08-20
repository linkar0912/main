import type { FlowCondition, FlowDefinitionV1, NormalizedEvent } from "./types";

function normalizedText(value: string): string {
  return value.trim().toLowerCase();
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

export function matchesTrigger(flow: FlowDefinitionV1, event: NormalizedEvent): boolean {
  const trigger = flow.trigger;

  if (trigger.type === "comment") {
    if (event.type !== "comment.created") return false;
    if (trigger.mediaIds.length > 0 && (!event.mediaId || !trigger.mediaIds.includes(event.mediaId))) {
      return false;
    }
    if (trigger.match === "keyword" && !containsKeyword(event.text, trigger.keywords)) return false;
  } else {
    if (event.type !== "message.received" && event.type !== "postback.received") return false;
    if (trigger.match === "keyword" && !containsKeyword(event.text, trigger.keywords)) return false;
  }

  return matchesConditions(flow.conditions, event);
}
