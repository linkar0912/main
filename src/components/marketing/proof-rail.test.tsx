// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ProofRail } from "./proof-rail";

const stylesheet = () => readFileSync(path.join(process.cwd(), "src/components/marketing/proof-rail.module.css"), "utf8");

describe("ProofRail", () => {
  afterEach(cleanup);

  it("presents two creator conversation examples beside the audience statement", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("region", { name: "Creator conversation examples" });
    expect(rail.id).toBe("proof");
    expect(rail.getAttribute("data-brand-palette")).toBe("linkar");
    expect(rail.getAttribute("data-strip")).toBe("creator-marquee");
    expect(within(rail).getByRole("heading", {
      level: 2,
      name: "Instagram automation for creators, marketers & brands.",
    })).toBeTruthy();

    const examples = within(rail).getAllByRole("article");
    expect(examples).toHaveLength(2);
    expect(examples.map((example) => within(example).getByRole("heading", { level: 3 }).textContent)).toEqual([
      "Beauty creator in Bengaluru",
      "Growth marketer in Mumbai",
    ]);
    expect(screen.getByRole("article", { name: "Beauty creator in Bengaluru" }).textContent)
      .toContain("Sends the shade guide when someone comments SHADE.");
    expect(screen.getByRole("article", { name: "Growth marketer in Mumbai" }).textContent)
      .toContain("Asks each new lead one question, then sends the follow-up that fits.");
  });

  it("presents illustrative use cases, not testimonials: no names, quotes or blockquotes", () => {
    const { container } = render(<ProofRail />);

    // Names may return only for real users who gave written consent.
    const named = /Aanya|Mehta|Arjun|Nair/i;
    expect(container.textContent).not.toMatch(named);
    for (const element of container.querySelectorAll("[alt], [aria-label], [title], [src], [srcset]")) {
      for (const attribute of ["alt", "aria-label", "title", "src", "srcset"]) {
        expect(element.getAttribute(attribute) ?? "").not.toMatch(named);
      }
    }
    expect(container.querySelectorAll("blockquote, q, cite")).toHaveLength(0);
    expect(container.textContent).not.toMatch(/[“”"]/);
    for (const card of container.querySelectorAll("[data-proof-card]")) {
      expect(card.textContent).toMatch(/^Example/);
    }
  });

  it("does not repeat headings, articles or alt text in the looping duplicate", () => {
    const { container } = render(<ProofRail />);
    const duplicate = container.querySelector("[data-proof-duplicate]");

    expect(duplicate?.getAttribute("aria-hidden")).toBe("true");
    expect(duplicate?.querySelectorAll("h1, h2, h3, h4, h5, h6, article, [id]")).toHaveLength(0);
    // Nothing in the hidden copy can take focus: no links, buttons or tab stops.
    expect(duplicate?.querySelectorAll("a, button, [tabindex]")).toHaveLength(0);
    expect(Array.from(duplicate?.querySelectorAll("img") ?? []).map((image) => image.getAttribute("alt"))).toEqual(["", ""]);
    expect(container.querySelectorAll("h3")).toHaveLength(2);
    expect(duplicate?.textContent).toContain("Beauty creator in Bengaluru");
  });

  it("asks the image optimizer for 1x and 2x portraits only, sized to the 68 px slot", () => {
    const { container } = render(<ProofRail />);
    const portraits = Array.from(container.querySelectorAll("img"));

    expect(portraits).toHaveLength(4);
    for (const portrait of portraits) {
      // A `sizes` attribute would switch to width descriptors and list every
      // configured width, each one a separate encode on the origin.
      expect(portrait.getAttribute("sizes")).toBeNull();
      expect(portrait.getAttribute("width")).toBe("68");
      const descriptors = (portrait.getAttribute("srcset") ?? "").split(",").map((candidate) => candidate.trim().split(/\s+/)[1]);
      expect(descriptors).toEqual(["1x", "2x"]);
    }
  });

  it("keeps the audience statement fixed while the creator examples live in a right-hand ticker", () => {
    render(<ProofRail />);

    const rail = screen.getByRole("region", { name: "Creator conversation examples" });
    expect(rail.getAttribute("data-proof-layout")).toBe("compact");
    const statement = rail.querySelector("[data-proof-statement]");
    const ticker = rail.querySelector("[data-proof-ticker]");
    const track = ticker?.querySelector("[data-proof-track]");
    const duplicate = ticker?.querySelector('[data-proof-duplicate][aria-hidden="true"]');

    expect(statement).not.toBeNull();
    expect(ticker).not.toBeNull();
    expect(track).not.toBeNull();
    expect(duplicate).not.toBeNull();
    expect(ticker?.querySelectorAll("[data-proof-card]")).toHaveLength(2);
  });

  it("describes each local portrait by its scene without naming anyone", () => {
    render(<ProofRail />);

    const beauty = screen.getByRole("article", { name: "Beauty creator in Bengaluru" });
    const growth = screen.getByRole("article", { name: "Growth marketer in Mumbai" });
    const cafe = within(beauty).getByAltText("A smiling woman in a linen shirt at a cafe table") as HTMLImageElement;
    const terrace = within(growth).getByAltText("A man in a dark shirt on a rooftop terrace at dusk") as HTMLImageElement;

    // The file names are neutral too: crawlers and image search read them
    // from src and srcset, so a first name there would undo the clean alt text.
    expect(cafe.getAttribute("src")).toContain("linkar-example-beauty-creator");
    expect(terrace.getAttribute("src")).toContain("linkar-example-growth-marketer");
  });

  it("labels the cards as examples without unsupported customer or follower claims", () => {
    render(<ProofRail />);

    const visibleCards = within(screen.getByRole("region", { name: "Creator conversation examples" }))
      .getAllByRole("article");
    expect(visibleCards.map((card) => within(card).getByText("Example").textContent)).toEqual(["Example", "Example"]);
    expect(visibleCards.map((card) => within(card).getByText(/workflow/).textContent?.replace("→", "").trim())).toEqual([
      "Comment to DM workflow",
      "Lead qualification workflow",
    ]);
    expect(screen.queryByText(/followers|customers|revenue|million|testimonial/i)).toBeNull();
    // The only control is the marquee's pause button.
    expect(screen.queryAllByRole("button")).toHaveLength(1);
  });

  it("links each card's workflow line to its feature guide, once", () => {
    const { container } = render(<ProofRail />);

    const cards = within(screen.getByRole("region", { name: "Creator conversation examples" })).getAllByRole("article");
    expect(cards.map((card) => {
      const links = within(card).getAllByRole("link");
      expect(links).toHaveLength(1);
      return [links[0].textContent?.replace("→", "").trim(), links[0].getAttribute("href")];
    })).toEqual([
      ["Comment to DM workflow", "/features/instagram-comment-to-dm"],
      ["Lead qualification workflow", "/features/instagram-lead-qualification"],
    ]);
    // The arrow is decoration, so the accessible name is the workflow alone.
    expect(screen.getByRole("link", { name: "Comment to DM workflow" })).toBeTruthy();
    // The looping copy draws the same line without a second link, so a
    // keyboard user tabs through two links, not four.
    expect(container.querySelectorAll("a")).toHaveLength(2);
    const copyFooters = Array.from(container.querySelectorAll("[data-proof-duplicate] p"))
      .filter((paragraph) => /workflow/.test(paragraph.textContent ?? ""));
    expect(copyFooters.map((footer) => footer.firstElementChild?.tagName)).toEqual(["SPAN", "SPAN"]);
    expect(copyFooters[0].firstElementChild?.className).toBe(container.querySelector("a")?.className);
  });

  it("stands still on phones as a swipeable row of whole cards", () => {
    const css = stylesheet();
    const phone = css.slice(css.indexOf("@media (max-width: 719px)"));
    const block = phone.slice(0, phone.indexOf("@media (prefers-reduced-motion"));

    expect(block).toContain("overflow-x: auto;");
    expect(block).toContain("scroll-snap-type: x mandatory;");
    expect(block).toContain("scroll-snap-align: start;");
    expect(block).toMatch(/\.track \{\s*animation: none;/);
    expect(block).toMatch(/\.trackSegment\[data-proof-duplicate\],\s*\.tickerToggle \{\s*display: none;/);
    // A vertical swipe that starts on the rail must still scroll the page.
    expect(block).toContain("touch-action: auto;");
    // Each use case wraps inside its card instead of running off the edge.
    expect(block).toMatch(/\.who,\s*\.useCase \{\s*white-space: normal;/);
  });

  it("offers a visible control that pauses and resumes the moving strip", () => {
    render(<ProofRail />);

    const ticker = document.querySelector("[data-proof-ticker]");
    const pause = screen.getByRole("button", { name: "Pause creator examples" });
    expect(pause.getAttribute("aria-pressed")).toBe("false");
    expect(ticker?.hasAttribute("data-paused")).toBe(false);

    fireEvent.click(pause);
    const play = screen.getByRole("button", { name: "Play creator examples" });
    expect(play.getAttribute("aria-pressed")).toBe("true");
    expect(ticker?.getAttribute("data-paused")).toBe("true");

    fireEvent.click(play);
    expect(ticker?.hasAttribute("data-paused")).toBe(false);
  });
});
