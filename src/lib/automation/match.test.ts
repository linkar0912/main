import { describe, expect, it } from "vitest";
import type { FlowDefinition, FlowDefinitionV1, NormalizedEvent } from "./types";
import { matchesTrigger, resolveReplyForMedia } from "./match";

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
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(true);
  });

  it("matches any comment only on selected media when media IDs are present", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: ["media_1"] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, mediaId: "media_2" })).toBe(false);
  });

  it("does not apply message triggers to comments", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_text", text: "₹499" }],
    };

    expect(matchesTrigger(flow, commentEvent)).toBe(false);
  });

  it("honors the 'all' match mode and requires every keyword", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "all", keywords: ["guide", "please"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, commentEvent)).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "send guide" })).toBe(false);
  });

  it("matches the 'exact' mode only when the entire comment equals the keyword", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "exact", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, { ...commentEvent, text: "guide" })).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "send guide" })).toBe(false);
  });

  it("supports regex mode and rejects invalid patterns safely", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "regex", keywords: ["^send .* guide$"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, { ...commentEvent, text: "send the guide" })).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "guide please" })).toBe(false);
    // Invalid regex - flow safely fails closed.
    const originalTrigger = flow.trigger;
    if (originalTrigger.type !== "comment") throw new Error("expected comment trigger");
    const broken: FlowDefinitionV1 = {
      ...flow,
      trigger: { ...originalTrigger, keywords: ["("] },
    };
    expect(matchesTrigger(broken, commentEvent)).toBe(false);
  });

  it("drops comments that match a negative keyword", () => {
    const flow: FlowDefinitionV1 = {
      version: 1,
      trigger: {
        type: "comment",
        match: "keyword",
        keywords: ["guide"],
        mediaIds: [],
        negativeKeywords: ["scam"],
      },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    expect(matchesTrigger(flow, commentEvent)).toBe(true);
    expect(matchesTrigger(flow, { ...commentEvent, text: "this is a scam, send the guide" })).toBe(false);
  });

  it("resolves the per-media reply override", () => {
    const trigger: FlowDefinition["trigger"] = {
      type: "comment",
      match: "keyword",
      keywords: ["guide"],
      mediaIds: [],
      replyPerMedia: { media_1: "Per-media reply" },
    };
    expect(resolveReplyForMedia(trigger, "media_1")).toBe("Per-media reply");
    expect(resolveReplyForMedia(trigger, "media_2")).toBeUndefined();
  });
});

