// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingHeader } from "./marketing-header";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

let animationFrames: FrameRequestCallback[] = [];

function setScrollPosition(position: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: position });
  Object.defineProperty(window, "pageYOffset", { configurable: true, value: position });
}

function flushAnimationFrames() {
  const frames = animationFrames;
  animationFrames = [];
  frames.forEach((frame) => frame(performance.now()));
}

function scrollTo(position: number) {
  act(() => {
    setScrollPosition(position);
    window.dispatchEvent(new Event("scroll"));
    flushAnimationFrames();
  });
}

function installBrowserControls({ reducedMotion = false }: { reducedMotion?: boolean } = {}) {
  animationFrames = [];
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 1_000 });
  setScrollPosition(0);
  vi.stubGlobal("requestAnimationFrame", vi.fn((callback: FrameRequestCallback) => {
    animationFrames.push(callback);
    return animationFrames.length;
  }));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: reducedMotion,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

function header() {
  return screen.getByRole("banner");
}

describe("MarketingHeader", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("exposes only Linkar marketing destinations", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const primaryNavigation = within(screen.getByRole("navigation", { name: "Primary" }));
    const accountNavigation = within(screen.getByRole("navigation", { name: "Account" }));
    expect(screen.getByRole("link", { name: "Linkar home" }).textContent).toBe("Linkar");
    // There is no language switcher, so the header does not pretend to have one.
    expect(screen.queryByLabelText(/Language/)).toBeNull();
    expect(header().textContent).not.toMatch(/\bEN\b/);
    expect(primaryNavigation.getByRole("link", { name: "Product" }).getAttribute("href")).toBe("/features");
    const solutions = primaryNavigation.getByRole("button", { name: "Solutions" });
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(solutions.getAttribute("aria-controls")).toBe("marketing-solutions");
    expect(primaryNavigation.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/#how-it-works");
    const resources = primaryNavigation.getByRole("button", { name: "Resources" });
    expect(resources.getAttribute("aria-expanded")).toBe("false");
    expect(resources.getAttribute("aria-controls")).toBe("marketing-resources");
    expect(accountNavigation.getByRole("link", { name: "Get started" }).getAttribute("href")).toBe("/signup");
    expect(accountNavigation.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
  });

  it("lets visitors switch themes from the shared header and persists the choice", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const toggle = screen.getByRole("button", { name: "Switch to dark mode" });
    fireEvent.click(toggle);

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("linkar-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(window.localStorage.getItem("linkar-theme")).toBe("light");
  });

  it("opens a channel-accurate Solutions panel", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const solutions = screen.getByRole("button", { name: "Solutions" });
    fireEvent.click(solutions);

    expect(solutions.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("navigation", { name: "Solutions" });
    expect(panel.getAttribute("id")).toBe("marketing-solutions");
    expect(within(panel).getByRole("link", { name: "Instagram" }).getAttribute("href")).toBe("/features/instagram-dm-automation");
    expect(within(panel).getByRole("link", { name: "Facebook Pages" }).getAttribute("href")).toBe("/features/facebook-comment-auto-reply");
    expect(within(panel).getByText("Private replies and DMs")).toBeTruthy();
    expect(within(panel).getByText("Public comment replies")).toBeTruthy();
    expect(within(panel).getByRole("link", { name: /Keyword replies/ }).getAttribute("href")).toBe("/features/instagram-keyword-replies");
    expect(within(panel).getByRole("link", { name: /Solutions by audience/ }).getAttribute("href")).toBe("/solutions");
    expect(within(panel).getByRole("link", { name: /All features/ }).getAttribute("href")).toBe("/features");
    for (const [name, href] of [
      ["Creators", "/solutions/content-creators"],
      ["Online coaches", "/solutions/online-coaches"],
      ["Ecommerce brands", "/solutions/ecommerce-brands"],
      ["Small businesses", "/solutions/small-businesses"],
      ["Restaurants and cafes", "/solutions/restaurants-cafes"],
    ]) {
      expect(within(panel).getByRole("link", { name: new RegExp(`^${name}`) }).getAttribute("href")).toBe(href);
    }
    // Every entry leads somewhere different.
    const hrefs = within(panel).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(document.querySelector("[data-solutions-backdrop]")).toBeTruthy();
  });

  it("opens a Resources panel with Linkar destinations", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const resources = screen.getByRole("button", { name: "Resources" });
    fireEvent.click(resources);

    expect(resources.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("navigation", { name: "Resources" });
    expect(panel.getAttribute("id")).toBe("marketing-resources");
    expect(within(panel).getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/#how-it-works");
    expect(within(panel).getByRole("link", { name: "All workflow recipes" }).getAttribute("href")).toBe("/templates");
    expect(within(panel).getByRole("link", { name: "Comment to guide" }).getAttribute("href")).toBe("/templates/comment-guide-delivery");
    expect(within(panel).getByRole("link", { name: "Price list reply" }).getAttribute("href")).toBe("/templates/dm-price-list");
    expect(within(panel).getByRole("link", { name: "Booking link reply" }).getAttribute("href")).toBe("/templates/booking-link");
    expect(within(panel).getByRole("link", { name: "Follow-gated freebie" }).getAttribute("href")).toBe("/templates/follow-gated-freebie");
    expect(within(panel).getByRole("link", { name: "All solutions" }).getAttribute("href")).toBe("/solutions");
    expect(within(panel).getByRole("link", { name: "Frequently asked questions" }).getAttribute("href")).toBe("/#faq");
    expect(within(panel).getByRole("link", { name: "Help center" }).getAttribute("href")).toBe("/support");
    expect(within(panel).getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect(within(panel).getByRole("link", { name: "Terms of service" }).getAttribute("href")).toBe("/terms");
    expect(within(panel).getByRole("link", { name: "Data deletion" }).getAttribute("href")).toBe("/data-deletion");
    expect(within(panel).getByRole("link", { name: "Contact" }).getAttribute("href")).toBe("/contact");
    const hrefs = within(panel).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("closes a panel when keyboard focus moves past it, but not on a blur with nowhere to go", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const solutions = screen.getByRole("button", { name: "Solutions" });
    fireEvent.click(solutions);
    const panel = screen.getByRole("navigation", { name: "Solutions" });
    const links = within(panel).getAllByRole("link");
    // Moving within the trigger's zone keeps it open.
    fireEvent.focusOut(solutions, { relatedTarget: links[0] });
    expect(screen.getByRole("navigation", { name: "Solutions" })).toBeTruthy();
    // A click on blank panel space blurs with no new focus target.
    fireEvent.focusOut(links[0], { relatedTarget: null });
    expect(screen.getByRole("navigation", { name: "Solutions" })).toBeTruthy();
    // Tab past the last link lands on Pricing: the panel closes.
    const pricing = within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Pricing" });
    fireEvent.focusOut(links.at(-1) as HTMLElement, { relatedTarget: pricing });
    expect(screen.queryByRole("navigation", { name: "Solutions" })).toBeNull();
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
  });

  it("marks the section the current page belongs to", () => {
    installBrowserControls();
    const primary = () => within(screen.getByRole("navigation", { name: "Primary" }));
    try {
      pathname.current = "/features";
      const view = render(<MarketingHeader />);
      expect(primary().getByRole("link", { name: "Product" }).getAttribute("aria-current")).toBe("page");
      view.unmount();

      pathname.current = "/features/instagram-dm-automation";
      const detail = render(<MarketingHeader />);
      expect(primary().getByRole("link", { name: "Product" }).getAttribute("aria-current")).toBe("true");
      expect(primary().getByRole("button", { name: "Solutions" }).getAttribute("aria-current")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
      const menu = within(screen.getByRole("dialog", { name: "Menu" }));
      expect(menu.getByRole("link", { name: "Product" }).getAttribute("aria-current")).toBe("true");
      expect(menu.getByRole("link", { name: "Instagram" }).getAttribute("aria-current")).toBe("page");
      expect(menu.getByRole("link", { name: "Pricing" }).getAttribute("aria-current")).toBeNull();
      detail.unmount();

      pathname.current = "/solutions/podcasters";
      const solution = render(<MarketingHeader />);
      expect(primary().getByRole("button", { name: "Solutions" }).getAttribute("aria-current")).toBe("true");
      expect(primary().getByRole("link", { name: "Product" }).getAttribute("aria-current")).toBeNull();
      solution.unmount();

      pathname.current = "/templates/booking-link";
      render(<MarketingHeader />);
      expect(primary().getByRole("button", { name: "Resources" }).getAttribute("aria-current")).toBe("true");
    } finally {
      pathname.current = "/";
    }
  });

  it("marks nothing on the app host, where the header is not on a marketing page", () => {
    installBrowserControls();
    pathname.current = "/features";
    try {
      render(<MarketingHeader siteOrigin="https://linkar.in" />);
      const primary = within(screen.getByRole("navigation", { name: "Primary" }));
      expect(primary.getByRole("link", { name: "Product" }).getAttribute("aria-current")).toBeNull();
    } finally {
      pathname.current = "/";
    }
  });

  it("keeps only one desktop mega menu open", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const solutions = screen.getByRole("button", { name: "Solutions" });
    const resources = screen.getByRole("button", { name: "Resources" });
    fireEvent.click(solutions);
    expect(screen.getByRole("navigation", { name: "Solutions" })).toBeTruthy();

    fireEvent.click(resources);

    expect(screen.queryByRole("navigation", { name: "Solutions" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Resources" })).toBeTruthy();
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(resources.getAttribute("aria-expanded")).toBe("true");
  });

  it("closes Resources with Escape and restores focus", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const resources = screen.getByRole("button", { name: "Resources" });
    fireEvent.click(resources);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("navigation", { name: "Resources" })).toBeNull();
    expect(resources.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(resources);
  });

  it("closes Resources from its backdrop and when desktop navigation is hidden", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const resources = screen.getByRole("button", { name: "Resources" });
    fireEvent.click(resources);
    fireEvent.click(screen.getByRole("button", { name: "Close Resources" }));
    expect(screen.queryByRole("navigation", { name: "Resources" })).toBeNull();

    fireEvent.click(resources);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_100 });
    fireEvent.resize(window);
    expect(screen.queryByRole("navigation", { name: "Resources" })).toBeNull();
  });

  it("keeps Solutions open when a pointer enters before clicking", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const solutions = screen.getByRole("button", { name: "Solutions" });
    fireEvent.pointerEnter(solutions);
    fireEvent.click(solutions);

    expect(solutions.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("navigation", { name: "Solutions" })).toBeTruthy();
  });

  it("toggles a panel closed with a second click on its trigger", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const resources = screen.getByRole("button", { name: "Resources" });
    fireEvent.click(resources);
    expect(resources.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(resources);
    expect(resources.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("navigation", { name: "Resources" })).toBeNull();
  });

  it("renders each panel directly after its trigger in document order", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const solutions = screen.getByRole("button", { name: "Solutions" });
    fireEvent.click(solutions);
    const panel = screen.getByRole("navigation", { name: "Solutions" });
    expect(solutions.nextElementSibling).toBe(panel);
    // Tabbing forward from the trigger reaches the panel's first link next.
    const firstLink = within(panel).getAllByRole("link")[0];
    expect(solutions.compareDocumentPosition(firstLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Pricing" })
      .compareDocumentPosition(firstLink) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it("closes a hover-opened panel shortly after the pointer leaves it", () => {
    vi.useFakeTimers();
    try {
      installBrowserControls();
      render(<MarketingHeader />);

      const solutions = screen.getByRole("button", { name: "Solutions" });
      fireEvent.pointerEnter(solutions);
      expect(screen.getByRole("navigation", { name: "Solutions" })).toBeTruthy();

      fireEvent.pointerLeave(solutions.parentElement as HTMLElement);
      // Crossing back in before the delay keeps it open.
      fireEvent.pointerEnter(solutions.parentElement as HTMLElement);
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.getByRole("navigation", { name: "Solutions" })).toBeTruthy();

      fireEvent.pointerLeave(solutions.parentElement as HTMLElement);
      act(() => { vi.advanceTimersByTime(500); });
      expect(screen.queryByRole("navigation", { name: "Solutions" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes Solutions with Escape and restores focus", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const solutions = screen.getByRole("button", { name: "Solutions" });
    fireEvent.click(solutions);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("navigation", { name: "Solutions" })).toBeNull();
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(solutions);
  });

  it("closes Solutions when the desktop navigation is hidden by a resize", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const solutions = screen.getByRole("button", { name: "Solutions" });
    fireEvent.click(solutions);
    expect(screen.getByRole("navigation", { name: "Solutions" })).toBeTruthy();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_100 });
    fireEvent.resize(window);

    expect(screen.queryByRole("navigation", { name: "Solutions" })).toBeNull();
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
  });

  it("stays visible while scrolling and settles onto its solid floating surface", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    expect(header().getAttribute("data-surface")).toBe("hero");
    expect(header().getAttribute("data-visibility")).toBe("visible");

    scrollTo(720);
    expect(header().getAttribute("data-surface")).toBe("solid");
    expect(header().getAttribute("data-visibility")).toBe("visible");

    scrollTo(820);
    expect(header().getAttribute("data-surface")).toBe("solid");
    expect(header().getAttribute("data-visibility")).toBe("visible");
    expect(screen.getByRole("link", { name: "Linkar home" }).textContent).toBe("Linkar");
  });

  it("preserves navigation focus while scrolling", () => {
    installBrowserControls();
    render(<MarketingHeader />);
    const product = screen.getByRole("link", { name: "Product" });
    product.focus();

    scrollTo(820);

    expect(header().getAttribute("data-visibility")).toBe("visible");
    expect(document.activeElement).toBe(product);
  });

  it("opens a labelled modal menu, locks scrolling, and focuses its close control", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const opener = screen.getByRole("button", { name: "Open menu" });
    expect(opener.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(opener);

    expect(opener.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Menu" }).getAttribute("aria-modal")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close menu" }));
  });

  it("marks the current page in the menu and ends it with the account actions", () => {
    installBrowserControls();
    pathname.current = "/pricing";
    render(<MarketingHeader />);

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const menu = within(screen.getByRole("dialog", { name: "Menu" }));
    expect(menu.getByRole("link", { name: "Pricing" }).getAttribute("aria-current")).toBe("page");
    expect(menu.getByRole("link", { name: "Product" }).getAttribute("aria-current")).toBeNull();
    const labels = menu.getAllByRole("link").map((link) => link.textContent);
    expect(labels.slice(-2)).toEqual(["Sign in", "Get started"]);
    // No Resources panel on phones: its two most useful entries stand on their own.
    expect(menu.getByRole("link", { name: "Questions" }).getAttribute("href")).toBe("/#faq");
    expect(menu.getByRole("link", { name: "Help center" }).getAttribute("href")).toBe("/support");
    expect(menu.queryByRole("link", { name: "Resources" })).toBeNull();
    pathname.current = "/";
  });

  it("traps tab focus in the menu and restores focus after Escape", () => {
    installBrowserControls();
    render(<MarketingHeader />);
    const opener = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(opener);

    const dialog = screen.getByRole("dialog", { name: "Menu" });
    const close = screen.getByRole("button", { name: "Close menu" });
    const links = Array.from(dialog.querySelectorAll<HTMLAnchorElement>("a"));
    links.at(-1)?.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(close);

    fireEvent.keyDown(dialog, { key: "Escape" });
    act(() => flushAnimationFrames());
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });

  it("returns focus to the opener when a tablet resize closes the menu", () => {
    installBrowserControls();
    render(<MarketingHeader />);
    const opener = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(opener);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close menu" }));

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    fireEvent.resize(window);
    act(() => flushAnimationFrames());

    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("leaves focus alone on a desktop resize when the menu is already closed", () => {
    installBrowserControls();
    render(<MarketingHeader />);
    const login = screen.getByRole("link", { name: "Sign in" });
    login.focus();

    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1_024 });
    fireEvent.resize(window);
    act(() => flushAnimationFrames());

    expect(document.activeElement).toBe(login);
  });

  it("closes the menu when a menu link is selected and clears scroll locking on unmount", () => {
    installBrowserControls();
    const view = render(<MarketingHeader />);
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));

    // A same-page link, so jsdom (which cannot navigate) only changes the hash.
    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile primary" })).getByRole("link", { name: "How it works" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(document.body.style.overflow).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    view.unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps the header visible under reduced motion while preserving threshold changes", () => {
    installBrowserControls({ reducedMotion: true });
    render(<MarketingHeader />);

    scrollTo(820);

    expect(header().getAttribute("data-surface")).toBe("solid");
    expect(header().getAttribute("data-visibility")).toBe("visible");
  });
});
