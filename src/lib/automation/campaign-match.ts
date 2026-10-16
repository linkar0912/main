import { createHash } from "node:crypto";
import { findMatchedKeyword } from "./match";
import type { FlowDefinitionV2, NormalizedEvent } from "./types";

export type CampaignMatchResult =
  | { matched: true; keyword?: string }
  | { matched: false; reason: string };

function normalizedText(value: string): string {
  return value.trim().toLowerCase();
}

export function matchCampaign(definition: FlowDefinitionV2, event: NormalizedEvent): CampaignMatchResult {
  if (event.type !== "comment.created") {
    return { matched: false, reason: "event is not a comment" };
  }

  if (definition.trigger.source === "next_media") {
    return { matched: false, reason: "next media is not bound" };
  }

  if (
    definition.trigger.source === "specific_media" &&
    (!event.mediaId || !definition.trigger.mediaIds.includes(event.mediaId))
  ) {
    return { matched: false, reason: "media did not match" };
  }

  if (definition.trigger.match === "any") {
    return { matched: true };
  }

  // One pass over the keywords with the event text normalized once and cached
  // matchers. The event id shares the event's keyword budget and results with
  // the classic automations checked after it. Campaigns match in "any" mode,
  // so a regex pattern the matcher cannot run never applies here.
  const keyword = findMatchedKeyword(event.text, definition.trigger.keywords, "any", event.id);
  if (!keyword) {
    return { matched: false, reason: "keyword did not match" };
  }

  return { matched: true, keyword: normalizedText(keyword) };
}

export function selectPublicReply(replies: string[], automationId: string, commentId: string): string | undefined {
  if (replies.length === 0) return undefined;

  const value = createHash("sha256").update(`${automationId}\0${commentId}`).digest().readUInt32BE(0);
  return replies[value % replies.length];
}
