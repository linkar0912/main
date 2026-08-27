// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { HeroSection } from "./hero-section";

describe("HeroSection", () => {
  afterEach(cleanup);

  it("renders the page's single outcome-led heading and supporting copy", () => {
    render(<HeroSection />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Turn attention into conversations that keep moving.",
    })).toBeTruthy();
    expect(screen.getByText(
      "Set the trigger once. Linkar replies with context, follows up on time, and brings you back when a real person matters.",
    )).toBeTruthy();
    expect(screen.getByText("Clear rules. Useful replies. Your voice.")).toBeTruthy();
  });

  it("offers a direct signup action and product anchor", () => {
    render(<HeroSection />);

    expect(screen.getByRole("link", { name: "Start building" }).getAttribute("href")).toBe("/signup");
    expect(screen.getByRole("link", { name: "See how it works" }).getAttribute("href")).toBe("#product");
  });

  it("keeps the full reply flow semantically available before enhancement", () => {
    const markup = renderToStaticMarkup(<HeroSection />);
    render(<HeroSection />);

    const scene = screen.getByRole("figure", { name: "A Linkar reply flow in motion" });
    expect(scene.querySelector("ol")).not.toBeNull();
    expect(screen.getByText("Can you send the guide?")).toBeTruthy();
    expect(screen.getByText("Keyword found: GUIDE")).toBeTruthy();
    expect(screen.getByText("Absolutely — I’ve sent the quick version. What are you hoping to improve first?")).toBeTruthy();
    expect(screen.getByText("Conversation moving")).toBeTruthy();
    expect(markup).toContain("Can you send the guide?");
    expect(markup).toContain("Conversation moving");
  });

  it("uses the approved local hero asset as a decorative, prioritized background", () => {
    render(<HeroSection />);

    const image = screen.getByAltText("") as HTMLImageElement;
    expect(image.getAttribute("src")).toContain("%2Fmarketing%2Flinkar-hero.webp");
    expect(image.getAttribute("sizes")).toBe("100vw");
    expect(image.getAttribute("data-nimg")).toBe("fill");
  });
});
