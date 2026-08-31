// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InsightsShowcase } from "./insights-showcase";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("InsightsShowcase", () => {
  it("shows the three real readouts against a labelled preview of the insights panel", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<InsightsShowcase />);

    const section = screen.getByRole("region", { name: "Every reply, accounted for." });
    expect(section.id).toBe("insights");

    expect(Array.from(section.querySelectorAll("h3"), (h) => h.textContent)).toEqual([
      "By day", "By post", "By link",
    ]);

    const figure = within(section).getByRole("figure", { name: "Linkar insights preview" });
    expect(figure.hasAttribute("data-reveal")).toBe(true);
    // The chart is decorative; the caption is what a screen reader gets.
    expect(figure.querySelector("figcaption")?.textContent).toMatch(/fourteen-day chart/i);
  });

  it("renders a fixed fourteen-day, two-series chart so the page is deterministic", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<InsightsShowcase />);

    // A marketing page must render identically on every request; nothing here
    // may depend on Date or Math.random.
    const columns = container.querySelectorAll('[class*="column"]');
    expect(columns).toHaveLength(14);
    expect(container.querySelectorAll('[data-series="sent"]').length).toBeGreaterThanOrEqual(14);
    expect(container.querySelectorAll('[data-series="reached"]').length).toBeGreaterThanOrEqual(14);

    // Every bar must have a height, and the tallest must reach the top.
    const heights = Array.from(container.querySelectorAll<HTMLElement>('[class*="bar"][data-series]'))
      .map((bar) => Number.parseInt(bar.style.blockSize, 10))
      .filter((value) => Number.isFinite(value));
    expect(heights).toHaveLength(28);
    expect(Math.min(...heights)).toBeGreaterThan(0);
    expect(Math.max(...heights)).toBe(100);
  });

  it("labels the lifecycle counts and attributes the tracked link to its automation", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<InsightsShowcase />);
    const section = screen.getByRole("region", { name: "Every reply, accounted for." });

    expect(Array.from(section.querySelectorAll("dt"), (t) => t.textContent)).toEqual([
      "Matched", "Replied", "Answered", "Handed over",
    ]);
    // Unique taps can never exceed total taps.
    const [total, unique] = Array.from(section.querySelectorAll('[class*="linkStat"] strong'), (s) =>
      Number.parseInt((s.textContent ?? "0").replace(/,/g, ""), 10));
    expect(total).toBeGreaterThan(0);
    expect(unique).toBeLessThanOrEqual(total);
    expect(within(section).getByText("Lead magnet from comments")).toBeTruthy();
  });

  it("makes no performance claim and offers no call to action", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<InsightsShowcase />);
    const section = screen.getByRole("region", { name: "Every reply, accounted for." });

    // Sample product data is fine; a stated result would not be.
    const copy = (section.textContent ?? "").toLowerCase();
    for (const claim of ["average", "customers see", "increase", "% more", "guaranteed", "roi"]) {
      expect(copy, claim).not.toContain(claim);
    }
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
  });
});
