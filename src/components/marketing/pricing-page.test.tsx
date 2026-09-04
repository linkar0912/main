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
      ["Free plan", "₹0", "1,000 deliveries", "5 automations", "1 account", "1 Page", "1 seat"],
      ["Creator plan", "₹199", "5,000 deliveries", "20 automations", "2 accounts", "2 Pages", "2 seats"],
      ["Growth plan", "₹499", "25,000 deliveries", "50 automations", "5 accounts", "5 Pages", "5 seats"],
      ["Agency plan", "₹999", "50,000 deliveries", "100 automations", "10 accounts", "10 Pages", "10 seats"],
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
    const comparison = screen.getByRole("region", { name: "Compare plans and pricing info" });

    expect(within(comparison).getByRole("columnheader", { name: "Choose your plan" })).toBeTruthy();
    for (const plan of ["Free", "Creator", "Growth", "Agency"]) {
      const header = within(comparison).getByRole("columnheader", { name: new RegExp(`^${plan}`) });
      expect(within(header).getByRole("link").getAttribute("href")).toBe("/signup");
    }

    const deliveries = within(comparison).getByRole("row", { name: /Monthly deliveries/ });
    for (const value of ["1,000", "5,000", "25,000", "50,000"]) {
      expect(within(deliveries).getByRole("cell", { name: value })).toBeTruthy();
    }
  });

  it("switches to annual pricing and explains the saving", () => {
    render(<PricingPage />);
    fireEvent.click(screen.getAllByRole("radio", { name: "Annual" })[0]);

    for (const radio of screen.getAllByRole("radio", { name: "Annual" })) {
      expect((radio as HTMLInputElement).checked).toBe(true);
    }
    for (const [plan, price] of [["Creator plan", "₹1,990"], ["Growth plan", "₹4,990"], ["Agency plan", "₹9,990"]]) {
      expect(within(screen.getByRole("article", { name: plan })).getByText(price)).toBeTruthy();
    }
    expect(screen.getAllByText("2 months free")).toHaveLength(3);
  });

  it("offers sign in without using em dashes in public copy", () => {
    const { container } = render(<PricingPage />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(container.textContent).not.toContain("\u2014");
  });
});

describe("PricingPage plan finder", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("walks the four questions and recommends the plan the answers need", () => {
    render(<PricingPage />);
    const finder = screen.getByRole("region", { name: "Pick your plan in 30 seconds" });

    expect(within(finder).getByRole("heading", { name: "Where do people find you?" })).toBeTruthy();
    expect(within(finder).getByRole("button", { name: /Next step/ }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(within(finder).getByRole("button", { name: /Instagram comments/ }));
    fireEvent.click(within(finder).getByRole("button", { name: /Next step/ }));

    fireEvent.click(within(finder).getByRole("button", { name: /Two or three/ }));
    fireEvent.click(within(finder).getByRole("button", { name: /Next step/ }));

    fireEvent.click(within(finder).getByRole("button", { name: /5,000 to 25,000/ }));
    fireEvent.click(within(finder).getByRole("button", { name: /Next step/ }));

    fireEvent.click(within(finder).getByRole("button", { name: /Just me/ }));
    fireEvent.click(within(finder).getByRole("button", { name: /See my plan/ }));

    expect(within(finder).getByText("Growth")).toBeTruthy();
    expect(within(finder).getByRole("link", { name: /Start with Growth/ }).getAttribute("href")).toBe("/signup");

    fireEvent.click(within(finder).getByRole("button", { name: "Start over" }));
    expect(within(finder).getByRole("heading", { name: "Where do people find you?" })).toBeTruthy();
  });

  it("keeps a shortcut to the finder in view", () => {
    render(<PricingPage />);
    expect(screen.getByRole("link", { name: /Pick your plan in 30 seconds/ }).getAttribute("href")).toBe("#plan-finder");
  });
});

describe("PricingPage billing sections", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("explains what a delivery is and when the count resets", () => {
    render(<PricingPage />);
    const section = screen.getByRole("region", { name: "What counts as a delivery" });

    expect(within(section).getByText("Nothing counts on the way in")).toBeTruthy();
    expect(within(section).getByText(/calendar month in UTC/)).toBeTruthy();
    expect(within(section).getByText(/Automations stop sending and report the limit/)).toBeTruthy();
  });

  it("shows an invoice and states how payment and cancellation work", () => {
    render(<PricingPage />);
    const section = screen.getByRole("region", { name: "No surprises on the invoice" });

    const factTerms = [...section.querySelectorAll("dt")]
      .filter((node) => !node.closest("[aria-hidden='true']"))
      .map((node) => node.textContent);

    expect(factTerms).toEqual(["Secure checkout", "Pay how you already pay", "Cancel anytime"]);
    expect([...section.querySelectorAll("li img")].map((node) => node.getAttribute("alt")))
      .toEqual(["Razorpay", "Visa", "Mastercard"]);
    expect(within(section).getByText(/end of the period you paid for/)).toBeTruthy();
    // GST is shown as a line on the invoice rather than asserted in a tile.
    expect(within(section).getByText("Applicable GST")).toBeTruthy();
    expect(within(section).getByText("Included")).toBeTruthy();
  });

  it("opens one billing question at a time", () => {
    render(<PricingPage />);
    const cancel = screen.getByRole("button", { name: "What happens if I cancel?" });
    const reset = screen.getByRole("button", { name: "When does my usage reset?" });

    expect(cancel.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(cancel);
    expect(cancel.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(reset);
    expect(cancel.getAttribute("aria-expanded")).toBe("false");
    expect(reset.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(reset);
    expect(reset.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes with a route into signup", () => {
    render(<PricingPage />);
    const cta = screen.getByRole("region", { name: "Start on Free. Move up when the DMs do." });

    expect(within(cta).getByRole("link", { name: "Start free" }).getAttribute("href")).toBe("/signup");
    expect(within(cta).getByRole("link", { name: /See how it works/ }).getAttribute("href")).toBe("/#how-it-works");
  });
});
