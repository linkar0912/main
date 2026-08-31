import { describe, expect, it } from "vitest";
import { parseAutomationTarget } from "./channel-target";

describe("parseAutomationTarget", () => {
  it.each([
    [{}, "missing provider and pin"],
    [{ provider: "INSTAGRAM" }, "missing Instagram pin"],
    [{ provider: "FACEBOOK" }, "missing Facebook pin"],
    [{ provider: "INSTAGRAM", facebookPageId: "page_1" }, "Instagram with Page pin"],
    [{ provider: "FACEBOOK", instagramAccountId: "ig_1" }, "Facebook with Instagram pin"],
    [{ provider: "FACEBOOK", facebookPageId: "page_1", instagramAccountId: "ig_1" }, "dual pin"],
    [{ provider: "TIKTOK", instagramAccountId: "ig_1" }, "unknown provider"],
  ])("rejects %s (%s)", (input, _label) => {
    expect(() => parseAutomationTarget(input, { requirePin: true })).toThrow("invalid_channel_target");
  });

  it("returns an explicit Instagram target", () => {
    expect(parseAutomationTarget(
      { provider: "INSTAGRAM", instagramAccountId: "ig_1" },
      { requirePin: true },
    )).toEqual({ provider: "INSTAGRAM", instagramAccountId: "ig_1" });
  });

  it("returns an explicit Facebook target", () => {
    expect(parseAutomationTarget(
      { provider: "FACEBOOK", facebookPageId: "page_1" },
      { requirePin: true },
    )).toEqual({ provider: "FACEBOOK", facebookPageId: "page_1" });
  });

  it("allows a target-neutral legacy update but validates an edited target", () => {
    expect(parseAutomationTarget({}, { requirePin: false })).toBeUndefined();
    expect(() => parseAutomationTarget(
      { provider: "FACEBOOK", facebookPageId: null },
      { requirePin: false },
    )).toThrow("invalid_channel_target");
  });
});
