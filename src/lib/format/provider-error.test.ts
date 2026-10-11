import { describe, expect, it } from "vitest";
import { humanizeProviderError } from "./provider-error";

describe("humanizeProviderError", () => {
  it.each([
    ["(#10) This message is sent outside of allowed window.", /more than 24 hours ago/],
    ["(#4) Application request limit reached", /limiting how fast/],
    ["(#551) This person isn't available right now.", /can't receive messages right now/],
    ["Webhook responded with HTTP 502 Bad Gateway", /lead webhook didn't accept/],
  ])("explains %s in plain words and keeps the raw text", (raw, expected) => {
    const result = humanizeProviderError(raw);
    expect(result.text).toMatch(expected);
    expect(result.translated).toBe(true);
    expect(result.raw).toBe(raw);
  });

  it("passes unknown English messages through untouched", () => {
    expect(humanizeProviderError("Meta did not confirm delivery")).toEqual({
      text: "Meta did not confirm delivery",
      translated: false,
      raw: "Meta did not confirm delivery",
    });
  });
});
