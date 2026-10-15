// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChannelShowcase } from "./channel-showcase";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChannelShowcase", () => {
  it("presents both channels without decorative sequence numbers", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ChannelShowcase />);

    const section = screen.getByRole("region", { name: "Instagram and Facebook automation" });
    expect(within(section).getByRole("heading", { name: "Instagram" })).toBeTruthy();
    expect(within(section).getByRole("heading", { name: "Facebook Pages" })).toBeTruthy();
    expect(within(section).queryAllByText(/^0[12]$/)).toHaveLength(0);
  });

  it("links each channel to its own guides with link text that names them", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ChannelShowcase />);

    const section = screen.getByRole("region", { name: "Instagram and Facebook automation" });
    const cards = Array.from(section.querySelectorAll("article"));
    expect(cards.map((card) => {
      const links = within(card).getAllByRole("link");
      expect(links).toHaveLength(1);
      return [card.getAttribute("data-channel"), links[0].textContent?.replace("→", "").trim(), links[0].getAttribute("href")];
    })).toEqual([
      ["instagram", "Explore Instagram automation features", "/features"],
      ["facebook", "Explore Facebook Page comment replies", "/features/facebook-comment-auto-reply"],
    ]);
    // No same-page jump and no generic "Explore workflows" anchor any more.
    expect(within(section).queryByRole("link", { name: "Explore workflows" })).toBeNull();
    expect(Array.from(section.querySelectorAll("a"), (link) => link.getAttribute("href")).some((href) => href?.includes("#"))).toBe(false);
    // The arrow is decoration, so the accessible name is the destination alone.
    expect(within(section).getByRole("link", { name: "Explore Facebook Page comment replies" })).toBeTruthy();
  });
});
