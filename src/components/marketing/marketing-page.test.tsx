// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketingPage } from "./marketing-page";

const landmarkIds = [
  "top",
  "proof",
  "product",
  "how-it-works",
  "surfaces",
  "outcomes",
  "workflows",
  "insights",
  "channels",
  "setup",
  "faq",
  "get-started",
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
    expect(landmarks).toHaveLength(14);
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
      "/#product",
      "/#how-it-works",
      "/#faq",
    ]));

    const navigation = screen.getByRole("navigation", { name: "Primary" });
    expect(within(navigation).getByRole("link", { name: "Product" }).getAttribute("href"))
      .toBe("/#product");
    expect(within(navigation).getByRole("link", { name: "Pricing" }).getAttribute("href"))
      .toBe("/pricing");
  });

  it("connects every same-page Resources link to a rendered section", () => {
    const { container } = render(<MarketingPage />);
    fireEvent.click(screen.getByRole("button", { name: "Resources" }));
    const resources = within(screen.getByRole("navigation", { name: "Resources" }));

    for (const label of ["How it works", "Automation workflows", "Frequently asked questions"]) {
      const href = resources.getByRole("link", { name: label }).getAttribute("href");
      expect(href?.startsWith("/#")).toBe(true);
      expect(container.querySelector(href?.slice(1) ?? "missing-anchor")).toBeTruthy();
    }
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

    const channels = screen.getByRole("region", { name: "Everywhere your audience is" });
    expect(within(channels).getByRole("heading", { name: "Instagram" })).toBeTruthy();
    expect(within(channels).getByText(/private replies, direct messages, and follow-gated/i)).toBeTruthy();
    expect(within(channels).getByRole("heading", { name: "Facebook Pages" })).toBeTruthy();
    expect(within(channels).getByText(/public replies to top-level Page comments/i)).toBeTruthy();
  });

  it("does not render em dashes in public copy", () => {
    const { container } = render(<MarketingPage />);
    expect(container.textContent).not.toContain("\u2014");
  });
});
