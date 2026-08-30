// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";

describe("social brand glyphs", () => {
  afterEach(cleanup);

  it("renders the Instagram brand mark as a transparent standalone SVG", () => {
    const { container } = render(<InstagramGlyph brand />);
    const logo = container.querySelector('svg[data-brand-logo="instagram"]');

    expect(logo).toBeTruthy();
    expect(logo?.getAttribute("style")).toBeNull();
  });

  it("renders the Facebook brand mark as a transparent standalone SVG", () => {
    const { container } = render(<FacebookGlyph brand />);
    const logo = container.querySelector('svg[data-brand-logo="facebook"]');

    expect(logo).toBeTruthy();
    expect(logo?.getAttribute("style")).toBeNull();
  });
});
