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

    const section = screen.getByRole("region", { name: "Start replying in three simple steps." });
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
    expect(Array.from(steps, (step) => within(step).getByRole("figure").querySelector("figcaption")?.textContent)).toEqual([
      "Connected securely",
      "Starting point ready",
      "Automatic reply is on",
    ]);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
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

    const section = screen.getByRole("region", { name: "Start replying in three simple steps." });
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
