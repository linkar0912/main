import { describe, expect, it } from "vitest";
import { spyBandMargin, spyLineFor } from "./seo-page-nav";

describe("on-page nav scrollspy band", () => {
  it("sits a third of the way down, never above the sticky bars", () => {
    expect(spyLineFor(900)).toBe(288);
    expect(spyLineFor(500)).toBe(200);
    expect(spyBandMargin(900)).toBe("-288px 0px -611px 0px");
  });

  it("stays a valid margin in a hidden or tiny viewport", () => {
    // IntersectionObserver throws on "--1px", which used to take the page down.
    for (const height of [0, 1, 120, 199.5]) {
      expect(spyBandMargin(height)).toMatch(/^-\d+px 0px -\d+px 0px$/);
    }
  });
});
