// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PricingPage } from "./pricing-page";

describe("PricingPage", () => {
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

  it("puts all four monthly plans first without the promotional hero", () => {
    render(<PricingPage />);

    expect(screen.getByRole("heading", { level: 1, name: "Plans that grow with you." })).toBeTruthy();
    expect(screen.getByText("Every price includes applicable GST.")).toBeTruthy();
    expect(screen.queryByLabelText("Free plan starts at zero rupees")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Your first 1,000 deliveries are on us." })).toBeNull();

    const expected = [
      ["Free plan", "₹0", "1,000 deliveries", "5 automations", "1 + 1 Instagram + Facebook", "1 seat"],
      ["Creator plan", "₹199", "5,000 deliveries", "20 automations", "2 + 2 Instagram + Facebook", "2 seats"],
      ["Growth plan", "₹499", "25,000 deliveries", "50 automations", "5 + 5 Instagram + Facebook", "5 seats"],
      ["Agency plan", "₹999", "50,000 deliveries", "100 automations", "10 + 10 Instagram + Facebook", "10 seats"],
    ] as const;

    for (const [name, price, ...limits] of expected) {
      const plan = screen.getByRole("article", { name });
      expect(within(plan).getByText(price)).toBeTruthy();
      for (const limit of limits) expect(within(plan).getByText(limit)).toBeTruthy();
      expect(within(plan).getByRole("link", { name: /start|choose/i }).getAttribute("href")).toBe("/signup");
    }
  });

  it("compares every plan using the same operating limits", () => {
    render(<PricingPage />);
    const comparison = screen.getByRole("region", { name: "Compare every plan" });

    for (const plan of ["Free", "Creator", "Growth", "Agency"]) {
      expect(within(comparison).getByRole("columnheader", { name: plan })).toBeTruthy();
    }

    const deliveries = within(comparison).getByRole("row", { name: /Monthly deliveries/ });
    for (const value of ["1,000", "5,000", "25,000", "50,000"]) {
      expect(within(deliveries).getByRole("cell", { name: value })).toBeTruthy();
    }
  });

  it("switches to annual pricing and explains the saving", () => {
    render(<PricingPage />);
    fireEvent.click(screen.getByRole("radio", { name: "Annual" }));

    for (const price of ["₹1,990", "₹4,990", "₹9,990"]) {
      expect(screen.getByText(price)).toBeTruthy();
    }
    expect(screen.getAllByText("2 months free")).toHaveLength(3);
  });

  it("offers sign in without using em dashes in public copy", () => {
    const { container } = render(<PricingPage />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(container.textContent).not.toContain("\u2014");
  });
});
