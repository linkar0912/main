import { describe, expect, it } from "vitest";
import type { FlowDefinition, NormalizedEvent } from "./types";
import { evaluateFlow } from "./engine";

const commentEvent: NormalizedEvent = {
  id: "comment_1",
  accountId: "ig_1",
  type: "comment.created",
  text: "guide",
  commentId: "comment_1",
  mediaId: "media_1",
  timestamp: 1,
};

describe("evaluateFlow", () => {
  it("creates one private-reply action for a matching comment", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: ["guide"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here is the guide" }],
    };

    expect(evaluateFlow(flow, commentEvent)).toEqual({
      status: "matched",
      matchedKeyword: "guide",
      actions: [{ type: "private_reply", commentId: "comment_1", text: "Here is the guide" }],
    });
  });

  it("rejects a persisted direct-message action on a comment trigger", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hello" }],
    };

    expect(evaluateFlow(flow, commentEvent)).toEqual({
      status: "skipped",
      reason: "comment triggers support only a private reply",
      actions: [],
    });
  });

  it("produces a link action for a matching inbound message", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: ["price"] },
      conditions: [],
      actions: [{ type: "send_link", text: "See pricing", url: "https://example.com/pricing" }],
    };

    const event: NormalizedEvent = {
      id: "message_1",
      accountId: "ig_1",
      type: "message.received",
      text: "PRICE",
      recipientId: "person_1",
      timestamp: 1,
    };

    expect(evaluateFlow(flow, event)).toEqual({
      status: "matched",
      matchedKeyword: "price",
      actions: [
        {
          type: "send_link",
          recipientId: "person_1",
          text: "See pricing",
          url: "https://example.com/pricing",
        },
      ],
    });
  });
});
