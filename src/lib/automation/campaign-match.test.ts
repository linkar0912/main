import { describe, expect, it } from "vitest";
import { matchCampaign, selectPublicReply } from "./campaign-match";
import type { FlowDefinitionV2, NormalizedEvent } from "./types";

const campaignDefinition: FlowDefinitionV2 = {
  version: 2,
  trigger: {
    type: "comment",
    source: "specific_media",
    mediaIds: ["media_1"],
    mediaSnapshots: [
      {
        id: "media_1",
        mediaType: "VIDEO",
        mediaProductType: "REELS",
        permalink: "https://www.instagram.com/reel/demo/",
        timestamp: "2026-08-21T00:00:00.000Z",
      },
    ],
    match: "keyword",
    keywords: ["guide"],
  },
  publicReplies: ["Check your DMs"],
  openingMessage: { text: "Reply below so I can check your follow status.", optInButtonLabel: "Check follow" },
  followGate: {
    required: true,
    notFollowingMessage: "Follow this account, then tap below.",
    recheckButtonLabel: "I've followed",
  },
  delivery: { text: "You're verified — here is your guide.", url: "https://example.com/guide" },
};

const commentEvent: NormalizedEvent = {
  id: "event_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "Please send the GUIDE",
  commentId: "comment_9",
  mediaId: "media_1",
  timestamp: 1,
};

describe("matchCampaign", () => {
  it("matches a keyword comment on specifically selected media", () => {
    expect(matchCampaign(campaignDefinition, commentEvent)).toEqual({ matched: true, keyword: "guide" });
  });

  it("matches any comment from all media", () => {
    const definition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "all_media", mediaIds: [], mediaSnapshots: [], match: "any", keywords: [] },
    };

    expect(matchCampaign(definition, { ...commentEvent, mediaId: "media_2", text: "Anything" })).toEqual({ matched: true });
  });

  it("does not match a keyword that is absent or a specific-media comment without its media ID", () => {
    expect(matchCampaign(campaignDefinition, { ...commentEvent, text: "Please send it" })).toEqual({
      matched: false,
      reason: "keyword did not match",
    });
    expect(matchCampaign(campaignDefinition, { ...commentEvent, mediaId: undefined })).toEqual({
      matched: false,
      reason: "media did not match",
    });
  });

  it("defers next-media matching until a runner binds media", () => {
    const definition: FlowDefinitionV2 = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "next_media", mediaIds: [], mediaSnapshots: [] },
    };

    expect(matchCampaign(definition, commentEvent)).toEqual({ matched: false, reason: "next media is not bound" });
  });
});

describe("selectPublicReply", () => {
  it("selects the same reply for the same automation and comment", () => {
    expect(selectPublicReply(["A", "B", "C"], "automation_1", "comment_9")).toBe(
      selectPublicReply(["A", "B", "C"], "automation_1", "comment_9"),
    );
  });

  it("returns undefined when no public replies are configured", () => {
    expect(selectPublicReply([], "automation_1", "comment_9")).toBeUndefined();
  });
});
