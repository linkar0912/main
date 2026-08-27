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
    vi.unstubAllGlobals();
  });

  it("exposes only Linkar marketing destinations", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    const primaryNavigation = within(screen.getByRole("navigation", { name: "Primary" }));
    expect(screen.getByRole("link", { name: "Linkar home" }).getAttribute("href")).toBe("/#top");
    expect(primaryNavigation.getByRole("link", { name: "Product" }).getAttribute("href")).toBe("/#product");
    expect(primaryNavigation.getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/#how-it-works");
    expect(primaryNavigation.getByRole("link", { name: "Resources" }).getAttribute("href")).toBe("/#resources");
    expect(primaryNavigation.getByRole("link", { name: "Get started" }).getAttribute("href")).toBe("/signup");
    expect(primaryNavigation.getByRole("link", { name: "Login" }).getAttribute("href")).toBe("/login");
  });

  it("becomes solid after the hero threshold, hides downward, and reappears upward", () => {
    installBrowserControls();
    render(<MarketingHeader />);

    expect(header().getAttribute("data-surface")).toBe("hero");
    expect(header().getAttribute("data-visibility")).toBe("visible");

    scrollTo(720);
    expect(header().getAttribute("data-surface")).toBe("solid");
    expect(header().getAttribute("data-visibility")).toBe("visible");

    scrollTo(820);
    expect(header().getAttribute("data-visibility")).toBe("hidden");

    scrollTo(810);
    expect(header().getAttribute("data-visibility")).toBe("visible");
  });

  it("does not hide while a header control has keyboard focus", () => {
    installBrowserControls();
    render(<MarketingHeader />);
    screen.getByRole("link", { name: "Linkar home" }).focus();

    scrollTo(820);

    expect(header().getAttribute("data-visibility")).toBe("visible");
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
