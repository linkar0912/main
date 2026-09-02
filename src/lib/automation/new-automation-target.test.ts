import { describe, expect, it } from "vitest";
import { parseNewAutomationTarget } from "./new-automation-target";

describe("parseNewAutomationTarget", () => {
  it("prefills the selected Facebook Page for a Page comment automation", () => {
    expect(
      parseNewAutomationTarget({
        provider: "facebook",
        surface: "comment",
        connection: "page_1",
      }),
    ).toEqual({ initialFacebookPageId: "page_1" });
  });

  it("does not treat an Instagram connection as a Facebook Page", () => {
    expect(
      parseNewAutomationTarget({
        provider: "instagram",
        surface: "comment",
        connection: "ig_1",
      }),
    ).toEqual({});
  });

  it("ignores incomplete or unsupported channel targets", () => {
    expect(parseNewAutomationTarget({ provider: "facebook", surface: "comment" })).toEqual({});
    expect(
      parseNewAutomationTarget({
        provider: "facebook",
        surface: "messaging",
        connection: "page_1",
      }),
    ).toEqual({});
  });

  it("returns a trimmed stable media id for Reel preselection", () => {
    expect(parseNewAutomationTarget({ media: " reel_1 " })).toEqual({
      initialMediaIds: ["reel_1"],
    });
    expect(parseNewAutomationTarget({ media: "   " })).toEqual({});
  });
});
