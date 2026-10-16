// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingPage } from "./marketing-page";

const landmarkIds = [
  "top",
  "product",
  "how-it-works",
  "surfaces",
  "outcomes",
  "workflows",
  "insights",
  "channels",
  "setup",
  "faq",
  "resources",
] as const;

describe("MarketingPage", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
    vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
      callback(performance.now());
      return 1;
    }));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("assembles the complete public page in its canonical order", () => {
    const { container } = render(<MarketingPage />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("main").getAttribute("id")).toBe("main-content");

    const landmarks = Array.from(
      container.querySelectorAll("header[data-surface], section[id], footer[id]"),
    );
    expect(landmarks).toHaveLength(12);
    expect(landmarks.map((landmark) => landmark.id || "header")).toEqual([
      "header",
      ...landmarkIds,
    ]);
  });

  it("keeps conversion and public navigation destinations complete", () => {
    const { container } = render(<MarketingPage />);
    const destinations = Array.from(container.querySelectorAll("a[href]"), (link) =>
      link.getAttribute("href"),
    );

    expect(destinations.filter((href) => href === "/signup").length).toBeGreaterThanOrEqual(2);
    expect(destinations).toEqual(expect.arrayContaining([
      "/login",
      "/pricing",
      "/features",
      "/solutions",
      "/templates",
      "/#how-it-works",
      "/#faq",
    ]));

    // The body links into the feature guides, not only the header and footer.
    const main = within(screen.getByRole("main"));
    for (const [name, href] of [
      ["Instagram comment to DM automation", "/features/instagram-comment-to-dm"],
      ["Instagram DM automation", "/features/instagram-dm-automation"],
      ["Instagram Story mention replies", "/features/instagram-story-mention-replies"],
      ["Instagram follow-gated campaigns", "/features/instagram-follow-gate"],
      ["See all Instagram automation features", "/features"],
    ]) {
      expect(main.getByRole("link", { name }).getAttribute("href")).toBe(href);
    }
    // The cards that name a destination link to it: the ready-made workflows
    // to their recipes, and each channel to its own guides.
    for (const [name, href] of [
      ["Instagram comment to guide template", "/templates/comment-guide-delivery"],
      ["Explore Instagram automation features", "/features"],
      ["Explore Facebook Page comment replies", "/features/facebook-comment-auto-reply"],
    ]) {
      // The open workflow's recipe link is in both the desktop tab panel and
      // the phone accordion; CSS shows one of them, jsdom shows both.
      const links = main.getAllByRole("link", { name });
      expect(links.length).toBeLessThanOrEqual(2);
      expect(links.every((link) => link.getAttribute("href") === href)).toBe(true);
    }
    const mainLinks = Array.from(screen.getByRole("main").querySelectorAll("a[href]"), (link) => link.getAttribute("href"));
    for (const slug of ["comment-guide-delivery", "lead-qualification", "offer-follow-up", "support-handoff"]) {
      expect(mainLinks).toContain(`/templates/${slug}`);
    }
    // No card sends people back to a section of the page they are already on.
    expect(mainLinks).not.toContain("/#surfaces");
    // Nothing hidden from assistive technology can take keyboard focus.
    expect(container.querySelectorAll('[aria-hidden="true"] a[href], [aria-hidden="true"] button')).toHaveLength(0);
    // /dashboard redirects to the app host and is disallowed in robots.txt.
    expect(destinations.some((href) => href?.startsWith("/dashboard"))).toBe(false);

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(within(navigation).getByRole("link", { name: "Product" }).getAttribute("href"))
      .toBe("/features");
    expect(within(navigation).getByRole("link", { name: "Pricing" }).getAttribute("href"))
      .toBe("/pricing");
  });

  it("connects every same-page Resources link to a rendered section", () => {
    const { container } = render(<MarketingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    const resources = within(screen.getByRole("navigation", { name: "Resources" }));

    for (const label of ["How it works", "Frequently asked questions"]) {
      const href = resources.getByRole("link", { name: label }).getAttribute("href");
      expect(href?.startsWith("/#")).toBe(true);
      expect(container.querySelector(href?.slice(1) ?? "missing-anchor")).toBeTruthy();
    }
    expect(resources.getByRole("link", { name: "All workflow recipes" }).getAttribute("href")).toBe("/templates");
    expect(resources.getByRole("link", { name: "All solutions" }).getAttribute("href")).toBe("/solutions");
  });

  it("renders only Linkar-owned public copy", () => {
    const { container } = render(<MarketingPage />);
    const publicText = container.textContent ?? "";
    const prohibitedBrand = ["many", "chat"].join("");

    expect(publicText.toLowerCase()).not.toContain(prohibitedBrand);
    expect(publicText.toLowerCase()).not.toContain(`${prohibitedBrand}.com`);
  });

  it("names both supported Meta channels without overstating Facebook capabilities", () => {
    render(<MarketingPage />);

    const channels = screen.getByRole("region", { name: "Instagram and Facebook automation" });
    expect(within(channels).getByRole("heading", { name: "Instagram" })).toBeTruthy();
    expect(within(channels).getByText(/private replies, direct messages, and follow-gated/i)).toBeTruthy();
    expect(within(channels).getByRole("heading", { name: "Facebook Pages" })).toBeTruthy();
    expect(within(channels).getByText(/public replies to top-level Page comments/i)).toBeTruthy();
  });

  it("shows no named testimonials", () => {
    const { container } = render(<MarketingPage />);

    // Names and quotes may appear only for real users who gave written consent.
    expect(container.textContent).not.toMatch(/Aanya|Arjun/);
    expect(container.querySelectorAll("blockquote, q, cite")).toHaveLength(0);
  });

  it("labels sample figures and uses placeholder handles in the product previews", () => {
    const { container } = render(<MarketingPage />);

    expect(Array.from(container.querySelectorAll("[data-sample-tag]"), (tag) => tag.textContent)).toEqual(["Sample", "Sample"]);
    expect(container.querySelector("#insights figcaption")?.textContent).toMatch(/^\s*Sample data\./);
    for (const id of ["insights", "setup", "outcomes"]) {
      expect(container.querySelector(`#${id} [data-nosnippet]`), id).not.toBeNull();
    }
    expect(container.textContent).not.toMatch(/meera|arjun|nikhil|aanya/i);
  });

  it("does not render em dashes in public copy", () => {
    const { container } = render(<MarketingPage />);
    expect(container.textContent).not.toContain("\u2014");
  });
});
