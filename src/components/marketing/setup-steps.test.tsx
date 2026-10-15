// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupSteps } from "./setup-steps";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SetupSteps", () => {
  it("renders the ordered three-step Linkar setup sequence with its local previews", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SetupSteps />);

    const section = screen.getByRole("region", { name: "Set up Instagram auto-replies in three steps." });
    expect(section.id).toBe("setup");
    expect(within(section).getByText("Linkar guides you from connecting an account to turning on your first automatic reply.")).toBeTruthy();

    const steps = Array.from(within(section).getByRole("list").querySelectorAll(":scope > li")).filter(
      (step): step is HTMLElement => step instanceof HTMLElement,
    );
    expect(steps).toHaveLength(3);
    expect(Array.from(steps, (step) => within(step).getByRole("heading", { level: 3 }).textContent)).toEqual([
      "Connect Instagram or Facebook",
      "Choose what starts the reply",
      "Review it and turn it on",
    ]);
    expect(Array.from(steps, (step) => within(step).getByText(/^0[1-3]$/).textContent)).toEqual(["01", "02", "03"]);
    expect(within(steps[0]).getByText("Choose the professional Instagram account or Facebook Page that Linkar should reply from.")).toBeTruthy();
    expect(within(steps[1]).getByText("Pick a comment, message, or Story mention, then choose the words Linkar should look for.")).toBeTruthy();
    expect(within(steps[2]).getByText("Read through the messages once, switch the reply on, and see what Linkar sends.")).toBeTruthy();
    expect(Array.from(steps, (step) => within(step).getByRole("figure").getAttribute("aria-label"))).toEqual([
      "Protected Linkar connection preview",
      "Linkar reply starting-point preview",
      "Linkar reply turned on preview",
    ]);
    expect(Array.from(steps, (step) => within(step).getByRole("figure").querySelector("svg"))).not.toContain(null);
    const onToggle = steps[2].querySelector('[data-toggle-state="on"]');
    expect(onToggle).not.toBeNull();
    expect(onToggle?.querySelector('[data-toggle-knob="true"]')).not.toBeNull();
    expect(Array.from(steps, (step) => within(step).getByRole("figure").querySelector("figcaption")?.textContent)).toEqual([
      "Connected securely. Sample data.",
      "Starting point ready. Sample data.",
      "Automatic reply is on. Sample data.",
    ]);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
  });

  it("labels the previews as sample data and keeps the mocks out of search snippets", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SetupSteps />);
    const figures = within(screen.getByRole("region", { name: "Set up Instagram auto-replies in three steps." })).getAllByRole("figure");

    // The caption keeps its visible status and adds the label for screen
    // readers, since the mock above it is aria-hidden.
    for (const figure of figures) {
      const hidden = figure.querySelector("figcaption [class*='srOnly']");
      expect(hidden?.textContent).toBe(". Sample data.");
    }
    // The visible tag sits in the status row, beside the counts it qualifies.
    const statRow = figures[2].querySelector("[data-sample-tag]")?.parentElement;
    expect(figures[2].querySelector("[data-sample-tag]")?.textContent).toBe("Sample");
    expect(statRow?.textContent).toContain("1,284");
    expect(statRow?.textContent).toContain("failed");
    // Every mock is a data-nosnippet div; the captions stay quotable.
    for (const figure of figures) {
      const mock = figure.querySelector(":scope > div");
      expect(mock?.hasAttribute("data-nosnippet")).toBe(true);
      expect(mock?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("lets the browser skip the section until it nears the viewport, with a measured content-box fallback height", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/setup-steps.module.css"), "utf8");
    const section = stylesheet.match(/^\.section \{[^}]+\}/m)?.[0] ?? "";

    expect(section).toContain("content-visibility: auto;");
    expect(section).toMatch(/contain-intrinsic-block-size: auto \d+px;/);
    // Block axis only, so the placeholder never claims a fixed width.
    expect(stylesheet).not.toContain("contain-intrinsic-size:");
    // Content-box heights (rendered height minus block padding and border),
    // in source order: desktop, wide (1600px and up), tablet, phone. The
    // browser adds the padding itself, so a full-section height here makes
    // in-page links clicked from higher up the page scroll past the section.
    const heights = [...stylesheet.matchAll(/contain-intrinsic-block-size: auto (\d+)px;/g)].map((match) => Number(match[1]));
    expect(heights).toEqual([960, 1020, 1200, 1970]);
  });

  it("leaves the complete sequence readable immediately when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SetupSteps />);

    const section = screen.getByRole("region", { name: "Set up Instagram auto-replies in three steps." });
    expect(section.getAttribute("data-reduced-motion-state")).toBe("visible");
    expect(within(section).getAllByRole("figure")).toHaveLength(3);
  });

  it("starts illustration motion only after each card is revealed", () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    const observer = {
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
    } as unknown as IntersectionObserver;
    vi.stubGlobal("IntersectionObserver", vi.fn(function IntersectionObserverConstructor(callback: IntersectionObserverCallback) {
      observerCallback = callback;
      return observer;
    }));

    render(<SetupSteps />);
    const cards = Array.from(screen.getByRole("list").querySelectorAll(":scope > li"));
    expect(cards).toHaveLength(3);
    expect(cards.every((card) => !card.hasAttribute("data-visible"))).toBe(true);

    act(() => {
      observerCallback?.(
        [{ isIntersecting: true, target: cards[1] } as unknown as IntersectionObserverEntry],
        observer,
      );
    });

    expect(cards[0].hasAttribute("data-visible")).toBe(false);
    expect(cards[1].getAttribute("data-visible")).toBe("true");
    expect(cards[2].hasAttribute("data-visible")).toBe(false);
  });

  it("scopes connector and switch animations to the revealed card state", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/setup-steps.module.css"), "utf8");

    expect(stylesheet).toContain('.revealCard[data-visible="true"] .connector {');
    expect(stylesheet).toContain('.revealCard[data-visible="true"] .switchKnob {');
    expect(stylesheet.match(/\.connector \{[^}]+\}/)?.[0]).not.toContain("animation:");
    expect(stylesheet.match(/\.switchKnob \{[^}]+\}/)?.[0]).not.toContain("animation:");
  });
});
