import { describe, expect, it } from "vitest";
import type { FlowDefinition, NormalizedEvent } from "./types";
import { matchesTrigger } from "./match";

const commentEvent: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "Please send the GUIDE",
  commentId: "comment_1",
  mediaId: "media_1",
  timestamp: 1,
};

describe("matchesTrigger", () => {
  it("matches comment keywords case-insensitively", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(true);
  });

  it("matches any comment only on selected media when media IDs are present", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: ["media_1"] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, mediaId: "media_2" })).toBe(false);
  });

  it("does not apply message triggers to comments", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_text", text: "₹499" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(false);
  });
});
