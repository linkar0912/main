// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingHeader } from "./marketing-header";

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
    expect(screen.getByLabelText("Language: English").textContent).toContain("EN");
    expect(primaryNavigation.getByRole("link", { name: "Product" }).getAttribute("href")).toBe("/#product");
    const solutions = primaryNavigation.getByRole("button", { name: "Solutions" });
    expect(solutions.getAttribute("aria-expanded")).toBe("false");
    expect(solutions.getAttribute("aria-controls")).toBe("marketing-solutions");
    expect(primaryNavigation.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/#how-it-works");
    expect(primaryNavigation.getByRole("link", { name: "Resources" }).getAttribute("href")).toBe("/#resources");
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
    expect(within(panel).getByRole("link", { name: "Instagram" }).getAttribute("href")).toBe("/#channels");
    expect(within(panel).getByRole("link", { name: "Facebook Pages" }).getAttribute("href")).toBe("/#channels");
    expect(within(panel).getByText("Private replies and DMs")).toBeTruthy();
    expect(within(panel).getByText("Public comment replies")).toBeTruthy();
    expect(document.querySelector("[data-solutions-backdrop]")).toBeTruthy();
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

    fireEvent.click(within(screen.getByRole("navigation", { name: "Mobile primary" })).getByRole("link", { name: "Product" }));
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
