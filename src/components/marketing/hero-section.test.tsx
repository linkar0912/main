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

  it("offers only the direct signup action from the copy subtree", () => {
    render(<HeroSection />);

    expect(screen.getByRole("link", { name: "Start building" }).getAttribute("href")).toBe("/signup");
    expect(screen.queryByRole("link", { name: "See how it works" })).toBeNull();
    expect(screen.queryByText("Linkar / reply flow")).toBeNull();
  });

  it("keeps the conversation preview semantically available before enhancement", () => {
    const markup = renderToStaticMarkup(<HeroSection />);
    render(<HeroSection />);

    const scene = screen.getByRole("figure", { name: "A Linkar conversation preview" });
    expect(scene.querySelector("ol")).toBeNull();
    expect(screen.queryByText("Grab your guide")).toBeNull();
    expect(screen.getByText("Do you have a website where I can see more?")).toBeTruthy();
    expect(screen.getByText("Absolutely, here’s our website. Want to see pricing too?")).toBeTruthy();
    expect(screen.getByText("Can I try it before I publish anything?")).toBeTruthy();
    expect(screen.queryByText("Hey, here’s that guide you requested!")).toBeNull();
    expect(screen.getByText("Conversation moving")).toBeTruthy();
    expect(markup).not.toContain("Grab your guide");
    expect(markup).toContain("Do you have a website where I can see more?");
    expect(markup).toContain("Absolutely, here’s our website. Want to see pricing too?");
    expect(markup).toContain("Can I try it before I publish anything?");
    expect(markup).not.toContain("Hey, here’s that guide you requested!");
    expect(markup).toContain("Conversation moving");
  });

  it("marks the hero conversation as a staged Linkar motion sequence", () => {
    render(<HeroSection />);

    const scene = screen.getByRole("figure", { name: "A Linkar conversation preview" });
    const stages = scene.querySelectorAll("[data-message-stage]");

    expect(scene.getAttribute("data-brand-palette")).toBe("linkar");
    expect(scene.getAttribute("data-conversation-motion")).toBe("looping");
    expect(scene.getAttribute("data-message-visibility")).toBe("stacking-feed");
    expect(scene.getAttribute("data-loop-continuity")).toBe("seamless");
    expect(Array.from(stages, (stage) => stage.getAttribute("data-message-stage"))).toEqual(["1", "2", "3"]);
  });

  it("exposes an always-visible primary label and an independently staged secondary roll", () => {
    render(<HeroSection />);

    const hero = screen.getByRole("region", { name: "Turn attention into conversations that keep moving." });
    const action = screen.getByRole("link", { name: "Start building" });

    expect(hero.getAttribute("data-motion")).toBe("staged");
    expect(action.getAttribute("data-motion-stage")).toBe("action");
    expect(action.getAttribute("data-roll-primary")).toBe("native");
    expect(action.getAttribute("data-roll-secondary")).toBe("entering");
    expect(action.getAttribute("data-contrast")).toBe("white-on-magenta");
    expect(action.parentElement?.getAttribute("data-action-visibility")).toBe("persistent");
    expect(action.parentElement?.getAttribute("data-motion-reduced")).toBe("final");
    expect(action.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it("uses the approved local hero asset as a decorative, prioritized background", () => {
    render(<HeroSection />);

    const image = screen.getByAltText("") as HTMLImageElement;
    expect(image.getAttribute("src")).toContain("%2Fmarketing%2Flinkar-hero-indian-relaxed.webp");
    expect(image.getAttribute("sizes")).toBe("100vw");
    expect(image.getAttribute("data-nimg")).toBe("fill");
  });
});
