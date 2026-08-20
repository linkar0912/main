import { describe, expect, it } from "vitest";
import { validateFlowDefinition } from "./definition";

describe("validateFlowDefinition", () => {
  it("accepts a comment keyword flow with a valid link action", () => {
    const flow = validateFlowDefinition({
      version: 1,
      trigger: { type: "comment", match: "keyword", keywords: [" GUIDE "], mediaIds: [] },
      conditions: [],
      actions: [{ type: "send_link", text: "Here is the guide", url: "https://example.com/guide" }],
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
});
