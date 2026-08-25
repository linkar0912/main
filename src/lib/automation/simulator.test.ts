import { describe, expect, it } from "vitest";
import { simulateDefinition, validateFlowSemantics } from "./simulator";
import type { FlowDefinitionV1 } from "./types";

describe("flow validation", () => {
  it("flags keyword flows with no keywords and unknown personalization tokens", () => {
    const issues = validateFlowSemantics({
      version: 1,
      trigger: { type: "message", match: "keyword", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hi {usrename}" }],
    });
    expect(issues.some((issue) => issue.severity === "error" && issue.message.includes("never fire"))).toBe(true);
    expect(issues.some((issue) => issue.severity === "warning" && issue.message.includes("{usrename}"))).toBe(true);
  });

  it("requires at least one quick-reply chip and flags over-long chips", () => {
    const blankIssues = validateFlowSemantics({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "quick_replies", text: "Pick one", replies: ["  ", ""] }],
    });
    expect(blankIssues.some((issue) => issue.severity === "error" && issue.message.includes("at least one reply chip"))).toBe(true);

    const longChipIssues = validateFlowSemantics({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "quick_replies", text: "Pick one", replies: [`${"x".repeat(30)}`] }],
    });
    expect(longChipIssues.some((issue) => issue.severity === "warning" && issue.message.includes("truncated"))).toBe(true);
  });

  it("rejects non-http links on buttons and links", () => {
    const issues = validateFlowSemantics({
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_button", text: "Hi", buttonLabel: "Open", url: "javascript:alert(1)" }],
    });
    expect(issues.some((issue) => issue.severity === "error" && issue.message.includes("http(s) URL"))).toBe(true);
  });
});

describe("flow simulation", () => {
  it("dry-runs a DM flow end-to-end without sending anything", () => {
    const definition: FlowDefinitionV1 = {
      version: 1,
      trigger: { type: "message", match: "any", keywords: [] },
      conditions: [],
      actions: [{ type: "send_text", text: "Hey {username}, here is the guide!" }],
    };
    const simulation = simulateDefinition(definition, {
      accountId: "ig_1",
      type: "message.received",
      text: "hello",
      recipientId: "person_9",
      senderUsername: "sam",
    });
    expect(simulation.matched).toBe(true);
    if (simulation.matched) {
      expect(simulation.actions).toHaveLength(1);
      expect(simulation.actions[0].summary).toContain("Hey sam, here is the guide!");
    }
  });

  it("reports why an event did not match", () => {
    const simulation = simulateDefinition(
      {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["pricing"] },
        conditions: [],
        actions: [{ type: "send_text", text: "Our pricing..." }],
      },
      { accountId: "ig_1", type: "message.received", text: "hello there", recipientId: "person_9" },
    );
    expect(simulation).toMatchObject({ matched: false, reason: "trigger did not match" });
  });

  it("previews the full campaign journey for a matching comment", () => {
    const simulation = simulateDefinition(
      {
        version: 2,
        trigger: { type: "comment", source: "all_media", mediaIds: [], mediaSnapshots: [], match: "keyword", keywords: ["guide"] },
        publicReplies: ["Sending it over!"],
        openingMessage: { text: "Here you go {username}", optInButtonLabel: "Send it" },
        followGate: { required: true, notFollowingMessage: "Follow first", recheckButtonLabel: "I follow" },
        delivery: { text: "Your link", url: "https://example.com/guide" },
      },
      { accountId: "ig_1", type: "comment.created", text: "pls send guide", commentId: "c1", mediaId: "m1" },
    );
    expect(simulation.matched).toBe(true);
    if (simulation.matched) {
      expect(simulation.actions.map((action) => action.type)).toEqual(["public_reply", "opening_message", "delivery"]);
      expect(simulation.actions[2]!.summary).toContain("follow check");
    }
  });
});
