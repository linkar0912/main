// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { HeroSection } from "./hero-section";

const HERO_HEADING = "Instagram automation for comments and DMs Reply to every opportunity. Even when you are away.";

function heroFile(name: string) {
  return readFileSync(path.join(process.cwd(), "src/components/marketing", name), "utf8");
}

/** Declarations of a top-level rule (not one nested in a media query). */
function topLevelRule(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))?.[1] ?? "";
}

function keyframes(css: string, name: string) {
  return css.match(new RegExp(`@keyframes ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1];
}

function animationName(declarations: string) {
  return declarations.match(/animation:\s*([\w-]+)/)?.[1];
}

describe("HeroSection", () => {
  afterEach(cleanup);

  it("renders the page's single outcome-led heading and supporting copy", () => {
    render(<HeroSection />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: HERO_HEADING })).toBeTruthy();
    expect(screen.getByText(
      "Choose what someone says or does, write the reply once, and let Linkar answer Instagram comments, DMs and Story mentions for you.",
    )).toBeTruthy();
    expect(screen.getByText("Free to start. Paid plans from ₹199 a month, GST included.")).toBeTruthy();
  });

  it("reads the proof line's price from the Creator plan", () => {
    const source = heroFile("hero-section.tsx");

    expect(source).toContain("BILLING_PLANS.creator.monthlyPaise / 100");
    expect(source).not.toMatch(/₹\s*199/);
  });

  it("offers only the direct signup action from the copy subtree", () => {
    render(<HeroSection />);

    expect(screen.getByRole("link", { name: "Create your first reply" }).getAttribute("href")).toBe("/signup");
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

  it("marks the hero conversation as a single-pass Linkar motion sequence", () => {
    render(<HeroSection />);

    const scene = screen.getByRole("figure", { name: "A Linkar conversation preview" });
    const stages = scene.querySelectorAll("[data-message-stage]");

    expect(scene.getAttribute("data-brand-palette")).toBe("linkar");
    expect(scene.getAttribute("data-conversation-motion")).toBe("single-pass");
    expect(scene.getAttribute("data-message-visibility")).toBe("stacking-feed");
    expect(scene.getAttribute("data-final-frame")).toBe("full-thread");
    expect(Array.from(stages, (stage) => stage.getAttribute("data-message-stage"))).toEqual(["1", "2", "3"]);
  });

  it("keeps the chat's layout work inside a fixed, contained feed at every breakpoint", () => {
    const css = heroFile("hero-section.module.css");
    const stackRules = [...css.matchAll(/\.messageStack \{([^}]*)\}/g)].map((match) => match[1]);

    // Desktop, tablet and phone each give the feed a fixed block size.
    expect(stackRules).toHaveLength(3);
    for (const rule of stackRules) {
      expect(rule).toMatch(/(?:^|[\s;])block-size: [\d.]+rem/);
      expect(rule).not.toMatch(/min-block-size/);
    }
    expect(topLevelRule(css, ".messageStack")).toMatch(/contain: size layout;/);
    expect(topLevelRule(css, ".messageStack")).not.toMatch(/animation/);
    expect(css).not.toMatch(/will-change/);
  });

  it("plays the conversation once and rests on the full thread", () => {
    const css = heroFile("hero-section.module.css");
    const motion = css.slice(0, css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const slotAnimations = [...motion.matchAll(/\.scene \[data-message-(?:stage="\d"|typing)\] \{\s*animation: ([^;]+);/g)].map((match) => match[1]);

    expect(slotAnimations).toHaveLength(4);
    for (const animation of slotAnimations) {
      expect(animation).not.toMatch(/infinite/);
      expect(animation).toMatch(/ 1 both$/);
    }
    // The three messages end open; the typing bubble ends closed.
    const messageIn = keyframes(css, "message-in") ?? "";
    expect(messageIn.slice(messageIn.indexOf("to {"))).toMatch(/grid-template-rows: 1fr;\s*opacity: 1;/);
    const typing = keyframes(css, "message-typing") ?? "";
    expect(typing.slice(typing.indexOf("100% {"))).toMatch(/grid-template-rows: 0fr;\s*opacity: 0;/);
    expect(css).not.toContain("conversation-cycle");
  });

  it("puts the head term in the H1 kicker, ahead of the display lines", () => {
    render(<HeroSection />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent?.startsWith("Instagram automation for comments and DMs")).toBe(true);
    expect(heading.textContent).toContain("Reply to every opportunity.");
  });

  it("exposes an always-visible primary label and a secondary roll kept for hover and focus", () => {
    render(<HeroSection />);

    const hero = screen.getByRole("region", { name: HERO_HEADING });
    const action = screen.getByRole("link", { name: "Create your first reply" });

    expect(hero.getAttribute("data-motion")).toBe("staged");
    expect(action.getAttribute("data-motion-stage")).toBe("action");
    expect(action.getAttribute("data-roll-primary")).toBe("native");
    expect(action.getAttribute("data-roll-secondary")).toBe("hover");
    expect(action.getAttribute("data-contrast")).toBe("white-on-magenta");
    expect(action.parentElement?.getAttribute("data-action-visibility")).toBe("persistent");
    expect(action.parentElement?.getAttribute("data-motion-reduced")).toBe("final");
    expect(action.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it("uses the approved local hero asset as a described, eagerly loaded background", () => {
    render(<HeroSection />);

    // getByRole skips anything inside an aria-hidden subtree, so this also
    // proves the description reaches assistive technology.
    const image = screen.getByRole("img", { name: /creator relaxing at his desk/i }) as HTMLImageElement;
    expect(image.closest("[aria-hidden]")).toBeNull();
    expect(image.getAttribute("src")).toContain("%2Fmarketing%2Flinkar-hero-indian-relaxed.webp");
    expect(image.getAttribute("sizes")).toBe("100vw");
    expect(image.getAttribute("data-nimg")).toBe("fill");
    expect(image.getAttribute("loading")).toBe("eager");
    // The heading text is the largest paint: next/image adds no preload of its own.
    expect(image.getAttribute("fetchpriority")).toBeNull();
    expect(document.head.querySelector('link[rel="preload"][as="image"]')).toBeNull();
  });

  it("loads the photo eagerly instead of preloading it (Next 16: never both)", () => {
    const image = heroFile("hero-section.tsx").match(/<Image\b[\s\S]*?\/>/)?.[0] ?? "";

    expect(image).toMatch(/^\s+loading="eager"$/m);
    expect(image).not.toMatch(/\bpreload\b/);
    expect(image).not.toMatch(/\bpriority\b/);
    expect(image).not.toMatch(/\bfetchPriority\b/);
    expect(image).toContain('alt="A creator relaxing at his desk while Linkar answers his Instagram comments and DMs"');
  });

  it("paints the H1 and lede at full opacity from the first frame", () => {
    const css = heroFile("hero-section.module.css");

    for (const selector of [".titleLine", ".titleKicker", ".body"]) {
      const name = animationName(topLevelRule(css, selector));
      expect(name, selector).toBeTruthy();
      const frames = keyframes(css, name!);
      expect(frames, `${selector} uses @keyframes ${name}`).toBeTruthy();
      expect(frames, `${selector} must not fade in`).not.toMatch(/opacity/);
      expect(frames).toMatch(/transform/);
    }
    // The photo keeps its scale settle.
    expect(animationName(topLevelRule(css, ".image"))).toBe("image-settle");
  });

  it("has no delayed roll-in of the CTA's second label on first load", () => {
    const css = heroFile("hero-section.module.css");

    expect(css).not.toContain("button-secondary-label-in");
    expect(css).not.toContain('data-roll-secondary="entering"');
  });

  it("switches every hero entrance off for reduced motion", () => {
    const css = heroFile("hero-section.module.css");
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    const list = reduced.match(/^([\s\S]*?)\{\s*animation: none;/)?.[1] ?? "";

    for (const selector of [".image", ".titleKicker", ".titleLine", ".body", ".actions", ".proof", ".scene"]) {
      expect(list).toContain(selector);
    }
  });
});
