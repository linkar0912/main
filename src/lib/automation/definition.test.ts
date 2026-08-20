import { describe, expect, it } from "vitest";
import { validateFlowDefinition } from "./definition";

describe("validateFlowDefinition", () => {
  it("accepts a comment keyword flow with a private reply", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: [" GUIDE "], mediaIds: [] },
      conditions: [],
      actions: [{ type: "private_reply", text: "Here is the guide: https://example.com/guide" }],
    });

    expect(flow.trigger.keywords).toEqual(["guide"]);
  });

  it("rejects flows without actions and invalid links", () => {
    expect(() =>
      validateFlowDefinition({
        version: 1,
        trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
        conditions: [],
        actions: [],
      }),
    ).toThrow();

    expect(() =>
      validateFlowDefinition({
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [{ type: "send_link", text: "Click", url: "not-a-url" }],
      }),
    ).toThrow();
  });

  it("allows only one private text reply for comment triggers", () => {
    expect(() => validateFlowDefinition({
      version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [],
      actions: [{ type: "send_link", text: "Guide", url: "https://example.com/guide" }],
    })).toThrow("Comment triggers support only a private reply");
    expect(() => validateFlowDefinition({
      version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [],
      actions: [{ type: "private_reply", text: "One" }, { type: "private_reply", text: "Two" }],
    })).toThrow();
  });
});
