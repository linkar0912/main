// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSeoPages, seoPagePath } from "@/src/content/seo";
import { SurfaceRunway } from "./surface-runway";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("SurfaceRunway", () => {
  it("renders four informational surface cards with their exact copy and labelled local previews", () => {
    render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Auto-reply to comments, DMs and Story mentions." });

    expect(section.id).toBe("surfaces");
    expect(within(section).getByText("Start with a comment, message, or Story mention and decide exactly what happens next.")).toBeTruthy();
    const cards = within(section).getAllByRole("article");
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([
      "Reply when someone comments", "Answer common messages", "Thank people for Story mentions", "Send links to followers",
    ]);
    expect(cards.map((card) => card.querySelector("p")?.textContent)).toEqual([
      "Choose a word such as GUIDE or PRICE and privately send the answer they asked for.",
      "Recognise questions about prices, hours, or delivery and answer them straight away.",
      "Send a warm thank-you when someone mentions your account in an Instagram Story.",
      "Ask permission, check that the person follows you, and then send the promised link.",
    ]);
    expect(within(section).getAllByRole("figure")).toHaveLength(4);
    expect(Array.from(section.querySelectorAll("figure")).every((preview) => preview.hasAttribute("data-reveal"))).toBe(true);
    expect(within(section).getAllByText("Someone comments → Chosen word matches → Private reply")).toHaveLength(1);
    // Links, but nothing else interactive: no buttons and nothing draggable.
    expect(section.querySelectorAll("button, [draggable='true']")).toHaveLength(0);
  });

  it("links each card to its feature guide with the feature's name as the link text", () => {
    render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Auto-reply to comments, DMs and Story mentions." });
    const cards = within(section).getAllByRole("article");

    expect(cards.map((card) => {
      const links = within(card).getAllByRole("link");
      expect(links).toHaveLength(1);
      return [links[0]?.textContent?.replace("→", "").trim(), links[0]?.getAttribute("href")];
    })).toEqual([
      ["Instagram comment to DM automation", "/features/instagram-comment-to-dm"],
      ["Instagram DM automation", "/features/instagram-dm-automation"],
      ["Instagram Story mention replies", "/features/instagram-story-mention-replies"],
      ["Instagram follow-gated campaigns", "/features/instagram-follow-gate"],
    ]);
    // The arrow is decoration, so the accessible name is the feature alone.
    expect(within(cards[0]!).getByRole("link", { name: "Instagram comment to DM automation" })).toBeTruthy();
  });

  it("keeps each card link's last word and arrow together so the arrow never wraps alone", () => {
    render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Auto-reply to comments, DMs and Story mentions." });

    expect(within(section).getAllByRole("article").map((card) => {
      const tail = within(card).getByRole("link").querySelector("[data-link-tail]");
      expect(tail?.querySelector('[aria-hidden="true"]')?.textContent).toBe("→");
      return tail?.textContent;
    })).toEqual(["automation→", "automation→", "replies→", "campaigns→"]);

    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/surface-runway.module.css"), "utf8");
    expect(stylesheet.match(/\n\.linkTail \{([\s\S]*?)\n\}/)?.[1]).toContain("white-space: nowrap;");
  });

  it("points every card at a feature guide that exists, never at a missing page", () => {
    render(<SurfaceRunway />);
    const guides = new Set(getSeoPages("features").map(seoPagePath));
    const section = screen.getByRole("region", { name: "Auto-reply to comments, DMs and Story mentions." });

    for (const card of within(section).getAllByRole("article")) {
      expect(guides.has(within(card).getByRole("link").getAttribute("href") ?? "")).toBe(true);
    }
  });

  it("closes with one link to every Instagram automation feature, after the cards", () => {
    render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Auto-reply to comments, DMs and Story mentions." });
    const all = within(section).getByRole("link", { name: "See all Instagram automation features" });

    expect(all.getAttribute("href")).toBe("/features");
    expect(all.closest("article")).toBeNull();
    const track = section.querySelector("ul");
    expect(track && track.compareDocumentPosition(all) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(section).getAllByRole("link")).toHaveLength(5);
    expect(within(section).queryByRole("link", { name: /learn more|read more|click here/i })).toBeNull();
  });

  it("numbers the cards in order so the first one is identifiable", () => {
    render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Auto-reply to comments, DMs and Story mentions." });

    expect(within(section).getAllByRole("article").map((card) => card.firstElementChild?.textContent))
      .toEqual(["01", "02", "03", "04"]);
  });

  it("hijacks no scrolling: the four cards are laid out, not translated past the viewport", () => {
    // This section used to be a 320vh sticky filmstrip that moved the track
    // sideways on scroll, which left cards sliced in half by the viewport edge
    // at almost every scroll position - card one was never fully visible. It is
    // a plain grid now, so it registers no scroll or resize work at all.
    const addEventListener = vi.spyOn(window, "addEventListener");
    const requestAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

    const view = render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Auto-reply to comments, DMs and Story mentions." });

    expect(addEventListener).not.toHaveBeenCalledWith("scroll", expect.any(Function), expect.anything());
    expect(addEventListener).not.toHaveBeenCalledWith("resize", expect.any(Function), expect.anything());
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(section.style.getPropertyValue("--runway-progress")).toBe("");
    view.unmount();
  });

  it("lays the cards out in a transform-free grid at every breakpoint", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/surface-runway.module.css"), "utf8");

    expect(stylesheet).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(stylesheet).not.toContain("position: sticky");
    expect(stylesheet).not.toContain("320vh");
    // The guard is specifically against the scroll-driven filmstrip returning:
    // the track must not be transformed, and no progress variable may drive it.
    // Keyframe transforms elsewhere in the file are the fragment motion.
    expect(stylesheet).not.toContain("--runway-progress");
    expect(stylesheet).not.toContain("--runway-travel");
    expect(stylesheet.match(/\n\.track \{([\s\S]*?)\n\}/)?.[1]).not.toContain("transform");

    const tabletRule = stylesheet.match(/@media \(min-width: 768px\) and \(max-width: 1023px\) \{([\s\S]*?)\n\}/)?.[1];
    expect(tabletRule).toContain(".track { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding: 0; }");

    const mobileRule = stylesheet.match(/@media \(max-width: 767px\) \{([\s\S]*?)\n\}/)?.[1];
    expect(mobileRule).toContain(".track { grid-template-columns: 1fr; gap: 20px; padding: 0; }");
  });

  it("gates the fragment motion on the reveal and disables it entirely for reduced motion", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/surface-runway.module.css"), "utf8");

    expect(stylesheet).toContain('.preview[data-visible="true"] .surface > *');
    expect(stylesheet).toMatch(/animation:\s*rowIn[^;]*var\(--d, 0ms\)/);

    const reducedMotion = stylesheet.slice(stylesheet.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain("animation: none !important;");
    expect(reducedMotion).toContain("display: none;");
  });

  it("sizes cards from their content instead of reserving a fixed block of empty space", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/surface-runway.module.css"), "utf8");
    const cardRule = stylesheet.match(/\n\.card \{([\s\S]*?)\n\}/)?.[1];

    expect(cardRule).toBeTruthy();
    // A 520px floor with the preview pushed down by `margin: auto` left a
    // ~100px hole between the body copy and the graphic in every card.
    expect(cardRule).not.toContain("min-block-size");
    expect(stylesheet.match(/\n\.preview \{([\s\S]*?)\n\}/)?.[1]).not.toContain("margin: auto");
  });
});
