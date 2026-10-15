// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { PricingPage } from "./pricing-page";

const pricingCss = () => readFileSync(path.join(process.cwd(), "src/components/marketing/pricing-page.module.css"), "utf8");
const KICKER = "Instagram automation pricing in India";

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

    expect(screen.getByRole("heading", { level: 1, name: `${KICKER} Plans that grow with you.` })).toBeTruthy();
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
      const expectedHref = name === "Free plan" ? "/signup" : `/signup?plan=${name.split(" ")[0].toLowerCase()}&interval=monthly`;
      expect(within(plan).getByRole("link", { name: /start|choose/i }).getAttribute("href")).toBe(expectedHref);
    }
  });

  it("names the search phrase in the H1 as a kicker above the display line", () => {
    render(<PricingPage />);
    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading.id).toBe("pricing-title");
    expect(heading.textContent).toBe(`${KICKER} Plans that grow with you.`);
    // The kicker is the first thing inside the H1, set as its own block.
    const kicker = heading.firstElementChild;
    expect(kicker?.tagName).toBe("SPAN");
    expect(kicker?.textContent?.trim()).toBe(KICKER);
    const css = pricingCss();
    expect(css.match(/\n\.titleKicker \{([\s\S]*?)\n\}/)?.[1]).toContain("display: block;");
  });

  it("keeps a way into signup inside a phone's first screen", () => {
    render(<PricingPage />);
    const heading = screen.getByRole("heading", { level: 1 });
    const intro = heading.parentElement as HTMLElement;
    const start = within(intro).getByRole("link", { name: "Start free, no card needed" });

    expect(start.getAttribute("href")).toBe("/signup");
    // Under the lead, above the billing toggle.
    const lead = intro.querySelector(":scope > p") as HTMLElement;
    const toggle = within(intro).getByRole("group", { name: "Billing period" });
    expect(lead.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(start.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Phones only: hidden by default, shown under 768px with a 44px target.
    const css = pricingCss();
    expect(css.match(/\n\.introStart \{([\s\S]*?)\n\}/)?.[1]).toContain("display: none;");
    const phone = css.slice(css.indexOf("@media (max-width: 767px)"));
    expect(phone.match(/\n {2}\.introStart \{([\s\S]*?)\n {2}\}/)?.[1]).toMatch(/display: inline-flex;[\s\S]*min-block-size: 44px;/);
  });

  it("says what a delivery is where the page first states the Free limit", () => {
    render(<PricingPage />);
    const free = screen.getByRole("article", { name: "Free plan" });
    const limit = within(free).getByText(`${FREE_BILLING_PLAN.monthlyDeliveryLimit.toLocaleString("en-IN")} deliveries`);

    expect(limit.parentElement?.textContent?.replace(/\s+/g, " ")).toBe("1,000 deliveries(messages Linkar sends) each month");
    // No earlier statement of the Free limit on the page.
    const before = document.body.textContent?.split("1,000 deliveries")[0] ?? "";
    expect(before).not.toMatch(/1,000|thousand/i);
  });

  it("compares every plan using the same operating limits", () => {
    render(<PricingPage />);
    const comparison = screen.getByRole("region", { name: "Every plan, side by side" });

    expect(within(comparison).getByRole("columnheader", { name: "Choose your plan" })).toBeTruthy();
    for (const plan of ["Free", "Creator", "Growth", "Agency"]) {
      const header = within(comparison).getByRole("columnheader", { name: new RegExp(`^${plan}`) });
      expect(within(header).getByRole("link").getAttribute("href")).toBe(plan === "Free" ? "/signup" : `/signup?plan=${plan.toLowerCase()}&interval=monthly`);
    }

    const deliveries = within(comparison).getByRole("row", { name: /Monthly deliveries/ });
    for (const value of ["1,000", "5,000", "25,000", "50,000"]) {
      expect(within(deliveries).getByRole("cell", { name: value })).toBeTruthy();
    }
  });

  it("leads from the comparison table to every feature guide", () => {
    render(<PricingPage />);
    const comparison = screen.getByRole("region", { name: "Every plan, side by side" });
    const features = within(comparison).getByRole("link", { name: "See every Instagram automation feature" });

    expect(features.getAttribute("href")).toBe("/features");
    expect(features.closest("table")).toBeNull();
    const table = within(comparison).getByRole("table");
    expect(table.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The last word and the decorative arrow share a no-wrap span, so the
    // arrow can never wrap on to a line of its own on a narrow phone.
    const tail = features.querySelector("[data-link-tail]");
    expect(tail?.textContent).toBe("feature→");
    expect(tail?.querySelector('[aria-hidden="true"]')?.textContent).toBe("→");
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/pricing-features-link.module.css"), "utf8");
    expect(stylesheet.match(/\n\.tail \{([\s\S]*?)\n\}/)?.[1]).toContain("white-space: nowrap;");
  });

  it("words its headings in Linkar's own voice", () => {
    render(<PricingPage />);
    const headings = screen.getAllByRole("heading").map((heading) => heading.textContent);

    expect(headings).toEqual(expect.arrayContaining(["Find your plan", "Where do your conversations start?", "Every plan, side by side"]));
    for (const retired of ["Pick your plan in 30 seconds", "Where do people find you?", "Compare plans and pricing info"]) {
      expect(document.body.textContent).not.toContain(retired);
    }
  });

  it("lets phones compare one plan at a time instead of scrolling the table sideways", () => {
    render(<PricingPage />);
    const comparison = screen.getByRole("region", { name: "Every plan, side by side" });
    const planSwitch = within(comparison).getByRole("group", { name: "Plan to compare" });
    const radios = within(planSwitch).getAllByRole("radio") as HTMLInputElement[];

    expect(radios.map((radio) => radio.labels?.[0]?.textContent)).toEqual(["Free", "Creator", "Growth", "Agency"]);
    expect(radios.filter((radio) => radio.checked).map((radio) => radio.value)).toEqual(["free"]);
    fireEvent.click(within(planSwitch).getByRole("radio", { name: "Growth" }));
    expect((within(planSwitch).getByRole("radio", { name: "Growth" }) as HTMLInputElement).checked).toBe(true);

    // Every plan column is tagged, so the phone CSS can show the chosen one.
    const table = within(comparison).getByRole("table");
    for (const row of within(table).getAllByRole("row")) {
      const planCells = Array.from(row.querySelectorAll("[data-plan]")).map((cell) => cell.getAttribute("data-plan"));
      expect(planCells).toEqual(["free", "creator", "growth", "agency"]);
    }

    const css = readFileSync(path.join(process.cwd(), "src/components/marketing/pricing-page.module.css"), "utf8");
    const phone = css.slice(css.indexOf("@supports selector(:has(*))"));
    expect(phone).toMatch(/@media \(max-width: 767px\)/);
    expect(phone).toMatch(/\.comparison table \{\s*min-inline-size: 0;/);
    for (const plan of ["free", "creator", "growth", "agency"]) {
      expect(phone).toContain(`.comparison:has(input[value="${plan}"]:checked) [data-plan]:not([data-plan="${plan}"])`);
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

    // Every plan link now carries the annual choice through to signup.
    const growth = screen.getByRole("article", { name: "Growth plan" });
    expect(within(growth).getByRole("link", { name: /choose/i }).getAttribute("href")).toBe("/signup?plan=growth&interval=annual");
    const comparison = screen.getByRole("region", { name: "Every plan, side by side" });
    const agency = within(comparison).getByRole("columnheader", { name: /^Agency/ });
    expect(within(agency).getByRole("link").getAttribute("href")).toBe("/signup?plan=agency&interval=annual");
    // The comparison shows the exact price, not a "From" price.
    expect(within(agency).getByText("₹9,990/yr")).toBeTruthy();
    expect(comparison.textContent).not.toMatch(/\bFrom\b/);
  });

  it("offers sign in without using em dashes in public copy", () => {
    const { container } = render(<PricingPage />);
    const signIn = screen.getAllByRole("link", { name: "Sign in" });
    expect(signIn.length).toBeGreaterThan(0);
    for (const link of signIn) expect(link.getAttribute("href")).toBe("/login");
    expect(container.textContent).not.toContain("\u2014");
  });
});

describe("PricingPage rendering split", () => {
  it("renders the page on the server and keeps client code to the interactive islands", () => {
    const source = (file: string) => readFileSync(path.join(process.cwd(), "src/components/marketing", file), "utf8");

    expect(source("pricing-page.tsx")).not.toMatch(/^"use client"/);
    expect(source("automation-story.tsx")).not.toMatch(/^"use client"/);
    expect(source("automation-story-scenes.tsx")).not.toMatch(/^"use client"/);
    for (const island of ["pricing-interval.tsx", "pricing-finder.tsx", "pricing-faq.tsx", "pricing-jump.tsx", "automation-story-shell.tsx"]) {
      expect(source(island)).toMatch(/^"use client"/);
    }
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
    const finder = screen.getByRole("region", { name: "Find your plan" });

    expect(within(finder).getByRole("heading", { name: "Where do your conversations start?" })).toBeTruthy();
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
    expect(within(finder).getByRole("link", { name: /Start with Growth/ }).getAttribute("href")).toBe("/signup?plan=growth&interval=monthly");

    fireEvent.click(within(finder).getByRole("button", { name: "Start over" }));
    expect(within(finder).getByRole("heading", { name: "Where do your conversations start?" })).toBeTruthy();
  });

  it("offers only channels Linkar supports and shows Facebook as a public comment reply", () => {
    render(<PricingPage />);
    const finder = screen.getByRole("region", { name: "Find your plan" });

    expect(within(finder).queryByRole("button", { name: /Messenger/ })).toBeNull();
    expect(finder.textContent).not.toMatch(/Messenger/);

    fireEvent.click(within(finder).getByRole("button", { name: /Facebook Page comments/ }));
    expect(finder.textContent).toContain("Commented on your Page post");
    // Facebook support is public comment replies only: no inbox hand-off.
    expect(finder.textContent).not.toMatch(/inbox/i);
  });

  it("keeps a shortcut to the finder, out of the tab order until it is shown", () => {
    const { container } = render(<PricingPage />);
    // Hidden over the opening plan cards so it never covers their buttons; it
    // appears once the visitor scrolls past them.
    const jump = container.querySelector<HTMLAnchorElement>('a[href="#plan-finder"]');
    if (!jump) throw new Error("missing finder shortcut");
    expect(jump.textContent).toContain("Find your plan");
    expect(jump.getAttribute("aria-hidden")).toBe("true");
    expect(jump.hasAttribute("data-visible")).toBe(false);
    expect(jump.getAttribute("tabindex")).toBe("-1");
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

  it("answers whether Instagram automation is free first, from the billing catalog", () => {
    const { container } = render(<PricingPage />);
    const faq = screen.getByRole("region", { name: "Before you pay for anything" });
    const questions = within(faq).getAllByRole("button").map((button) => button.textContent);

    expect(questions[0]).toBe("Is Instagram automation free?");
    const trigger = within(faq).getByRole("button", { name: "Is Instagram automation free?" });
    fireEvent.click(trigger);
    const answer = document.getElementById(trigger.getAttribute("aria-controls") ?? "")?.textContent ?? "";

    const cheapest = Math.min(...Object.values(BILLING_PLANS).map((plan) => plan.monthlyPaise)) / 100;
    expect(answer).toContain(`${FREE_BILLING_PLAN.monthlyDeliveryLimit.toLocaleString("en-IN")} deliveries (messages Linkar sends) a month`);
    expect(answer).toContain(`${FREE_BILLING_PLAN.automationLimit} automations`);
    expect(answer).toContain(`${FREE_BILLING_PLAN.instagramConnectionLimit} Instagram account `);
    expect(answer).toContain(`${FREE_BILLING_PLAN.facebookConnectionLimit} Facebook Page.`);
    expect(answer).toContain("₹0");
    expect(answer).toContain("no card");
    expect(answer).toContain(`₹${cheapest} a month, including applicable GST`);
    expect(answer).not.toMatch(/\bUPI\b/);
    // A plain accordion: no FAQPage markup for it.
    for (const script of container.querySelectorAll('script[type="application/ld+json"]')) {
      expect(script.textContent).not.toContain("FAQPage");
    }
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

  it("hides collapsed answers from assistive technology", () => {
    render(<PricingPage />);
    const cancel = screen.getByRole("button", { name: "What happens if I cancel?" });
    const answer = () => document.getElementById(cancel.getAttribute("aria-controls") ?? "")?.firstElementChild;

    expect(answer()?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(cancel);
    expect(answer()?.getAttribute("aria-hidden")).toBe("false");
  });

  it("closes with a route into signup", () => {
    render(<PricingPage />);
    const cta = screen.getByRole("region", { name: "Start on Free. Move up when the DMs do." });

    expect(within(cta).getByRole("link", { name: "Start free" }).getAttribute("href")).toBe("/signup");
    expect(within(cta).getByRole("link", { name: /See how it works/ }).getAttribute("href")).toBe("/#how-it-works");
  });
});

describe("PricingPage first paint", () => {
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

  it("settles the intro with transform only, so it is readable from the first frame", () => {
    const css = pricingCss();
    const introRule = css.match(/\.intro h1,\n\.intro > p,\n\.intro \.introStart,\n\.intro \.periodRow \{([\s\S]*?)\n\}/)?.[1];
    expect(introRule).toMatch(/animation: introSettle /);
    const settle = css.match(/@keyframes introSettle \{([\s\S]*?)\n\}/)?.[1];
    expect(settle).toContain("translateY(26px)");
    expect(settle).not.toContain("opacity");

    // The finder stats below the fold keep their fade.
    expect(css).toMatch(/\.finderCard\[data-visible="true"\] \.previewStats div \{\s*animation: pricingRise /);

    const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce) {\n  .intro h1"));
    for (const selector of [".intro h1", ".intro > p", ".intro .introStart", ".intro .periodRow", ".price strong[data-swap]", ".choosePrice[data-swap]", ".invoiceTotal strong[data-swap]"]) {
      expect(reduced.slice(0, reduced.indexOf("animation: none;"))).toContain(selector);
    }
  });

  it("swaps prices without blur, and only after the visitor changes the billing period", () => {
    const css = pricingCss();
    const swap = css.match(/@keyframes priceSwap \{([\s\S]*?)\n\}/)?.[1];
    expect(swap).toBeTruthy();
    expect(swap).not.toContain("filter");
    // Every rule that runs the swap is gated on data-swap.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...rules.matchAll(/([^{}]+)\{[^{}]*animation:\s*priceSwap[^{}]*\}/g)].map((match) => match[1].trim());
    expect(selectors.length).toBeGreaterThan(0);
    for (const group of selectors) {
      for (const selector of group.split(",")) expect(selector).toContain("[data-swap]");
    }

    const { container } = render(<PricingPage />);
    expect(container.querySelectorAll("[data-swap]")).toHaveLength(0);

    fireEvent.click(screen.getAllByRole("radio", { name: "Annual" })[0]);
    for (const plan of ["Free plan", "Creator plan", "Growth plan", "Agency plan"]) {
      const price = within(screen.getByRole("article", { name: plan })).getByText(/^₹/);
      expect(price.hasAttribute("data-swap")).toBe(true);
    }
    const comparison = screen.getByRole("region", { name: "Every plan, side by side" });
    expect(within(comparison).getByText("₹9,990/yr").hasAttribute("data-swap")).toBe(true);
    const invoice = screen.getByRole("region", { name: "No surprises on the invoice" });
    expect(invoice.querySelector("p strong[data-swap]")?.textContent).toBe("₹4,990");
  });
});
