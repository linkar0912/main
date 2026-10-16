import { describe, expect, it } from "vitest";
import type { FlowDefinition, FlowDefinitionV1, NormalizedEvent } from "./types";
import { evaluateFlow, UNSUPPORTED_REGEX_REASON } from "./engine";

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

  it("reports the keyword the trigger check matched for each match mode", () => {
    const flow = (mode: "all" | "contains" | "regex", keywords: string[]): FlowDefinitionV1 => ({
      version: 1,
      trigger: { type: "comment", match: "keyword", mode, keywords, mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here is the guide" }],
    });
    const event = { ...commentEvent, text: "Send the GUIDE please" };

    expect(evaluateFlow(flow("regex", ["^price", "guide\\s+please$"]), event)).toMatchObject({
      status: "matched",
      matchedKeyword: "guide\\s+please$",
    });
    expect(evaluateFlow(flow("all", ["guide", "please"]), event)).toMatchObject({ status: "matched", matchedKeyword: "guide" });
    expect(evaluateFlow(flow("contains", ["uid"]), event)).toMatchObject({ status: "matched", matchedKeyword: "uid" });
  });

  it("leaves matchedKeyword out for triggers that do not use keywords", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Thanks" }],
    };

    expect(evaluateFlow(flow, commentEvent)).toEqual({
      status: "matched",
      actions: [{ type: "private_reply", commentId: "comment_1", text: "Thanks" }],
    });
  });

  it("skips a regex flow without stalling on a catastrophic-backtracking pattern", () => {
    const flow: FlowDefinition = {
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "regex", keywords: ["(a|a)+$"], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    };
    const started = performance.now();
    expect(evaluateFlow(flow, { ...commentEvent, text: `${"a".repeat(40)}!` })).toEqual({
      status: "skipped",
      reason: "trigger did not match",
      actions: [],
    });
    expect(performance.now() - started).toBeLessThan(50);
  });

  it("tells a regex pattern the matcher cannot run apart from a comment that did not match", () => {
    const flow = (keywords: string[]): FlowDefinitionV1 => ({
      version: 1,
      trigger: { type: "comment", match: "keyword", mode: "regex", keywords, mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Sent" }],
    });
    const event = { ...commentEvent, id: "legacy_regex", text: "I am interested!" };

    // Saved before the matcher's rules: a lookbehind never matches, and says why.
    expect(evaluateFlow(flow(["(?<!not )interested"]), event)).toEqual({
      status: "skipped",
      reason: UNSUPPORTED_REGEX_REASON,
      actions: [],
    });
    expect(UNSUPPORTED_REGEX_REASON).toBe("regex pattern not supported");
    // A keyword that does compile still answers for the automation.
    expect(evaluateFlow(flow(["(?<!not )interested", "interested"]), event)).toMatchObject({
      status: "matched",
      matchedKeyword: "interested",
    });
    // Valid patterns that miss read as an ordinary miss.
    expect(evaluateFlow(flow(["price"]), event)).toEqual({ status: "skipped", reason: "trigger did not match", actions: [] });
  });
});

