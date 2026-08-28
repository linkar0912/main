// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStory } from "./automation-story";

type MediaQueryListener = (event: MediaQueryListEvent) => void;

function installMediaQueries({ desktop = true, reducedMotion = false } = {}) {
  const listeners = new Map<string, Set<MediaQueryListener>>();
  const queries = new Map<string, MediaQueryList>();

  const matchMedia = vi.fn((query: string) => {
    const matches = query === "(min-width: 1024px)" ? desktop : reducedMotion;
    const queryListeners = listeners.get(query) ?? new Set<MediaQueryListener>();
    listeners.set(query, queryListeners);

    const mediaQuery = {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: "change", listener: MediaQueryListener) => queryListeners.add(listener)),
      removeEventListener: vi.fn((_type: "change", listener: MediaQueryListener) => queryListeners.delete(listener)),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    queries.set(query, mediaQuery);
    return mediaQuery;
  });

  vi.stubGlobal("matchMedia", matchMedia);
  return { matchMedia, listeners, queries };
}

describe("AutomationStory", () => {
  beforeEach(() => {
    installMediaQueries();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("server-renders the four Linkar chapters and complete flow in exact reading order", () => {
    const markup = renderToStaticMarkup(<AutomationStory />);
    render(<AutomationStory />);

    const section = screen.getByRole("region", {
      name: "One spark. A conversation that knows what comes next.",
    });
    expect(section.id).toBe("how-it-works");
    expect(section.getAttribute("data-active-scene")).toBe("comment");
    expect(section.getAttribute("data-active-index")).toBe("0");

    expect(
      screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([
      "Open the right door",
      "Learn what matters",
      "Return on time",
      "Bring in a person",
    ]);
    expect(
      Array.from(section.querySelectorAll("[data-sequence]")).map((number) => number.textContent),
    ).toEqual(["01", "02", "03", "04"]);

    [
      "GUIDE please",
      "Keyword matched",
      "The quick guide is ready. What would you like to improve first?",
      "More replies or better leads?",
      "Better leads",
      "Goal saved",
      "Now: guide sent",
      "+ 18h: check in",
      "Within window",
      "Project details received",
      "Automation paused",
      "Ready for you",
    ].forEach((state) => expect(markup).toContain(state));

    expect(screen.getByRole("figure", { name: "Four stages of a Linkar conversation" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps every desktop scene mounted while the active chapter crossfades", () => {
    render(<AutomationStory />);

    const stage = document.querySelector("[data-desktop-stage]");
    expect(stage).not.toBeNull();
    expect(stage?.querySelectorAll("[data-scene]")).toHaveLength(4);
    expect(stage?.querySelector('[data-scene="comment"]')?.getAttribute("data-active")).toBe("true");
    expect(stage?.querySelector('[data-scene="qualify"]')?.getAttribute("data-active")).toBe("false");
  });

  it("uses one desktop observer at the 45% activation line and maps all chapter bands", () => {
    let callback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    const observer = { observe, unobserve, disconnect } as unknown as IntersectionObserver;
    const IntersectionObserverMock = vi.fn(
      function IntersectionObserverConstructor(
        observerCallback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        callback = observerCallback;
        expect(options).toEqual({
          root: null,
          rootMargin: "-45% 0px -55% 0px",
          threshold: 0,
        });
        return observer;
      },
    );
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    render(<AutomationStory />);
    const section = screen.getByRole("region", {
      name: "One spark. A conversation that knows what comes next.",
    });
    const chapters = Array.from(section.querySelectorAll<HTMLElement>("[data-chapter]"));

    expect(IntersectionObserverMock).toHaveBeenCalledTimes(1);
    expect(chapters).toHaveLength(4);
    chapters.forEach((chapter) => expect(observe).toHaveBeenCalledWith(chapter));

    chapters.forEach((chapter, index) => {
      act(() => {
        callback?.(
          [{ isIntersecting: true, target: chapter } as unknown as IntersectionObserverEntry],
          observer,
        );
      });
      expect(section.getAttribute("data-active-index")).toBe(String(index));
      expect(section.getAttribute("data-active-scene")).toBe(
        ["comment", "qualify", "followup", "handoff"][index],
      );
    });

    expect(unobserve).not.toHaveBeenCalled();
  });

  it("places each non-sticky scene immediately after its matching chapter copy in DOM order", () => {
    installMediaQueries({ desktop: false });
    render(<AutomationStory />);

    const chapters = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    expect(chapters).toHaveLength(4);
    chapters.forEach((chapter, index) => {
      const copy = chapter.querySelector("[data-chapter-copy]");
      const scene = chapter.querySelector("[data-flow-scene]");
      expect(copy).not.toBeNull();
      expect(scene).not.toBeNull();
      expect(copy?.nextElementSibling).toBe(scene);
      expect(scene?.getAttribute("data-flow-scene")).toBe(
        ["comment", "qualify", "followup", "handoff"][index],
      );
    });
  });

  it("does not register scroll tracking for reduced motion and presents the complete flow", () => {
    installMediaQueries({ desktop: true, reducedMotion: true });
    const IntersectionObserverMock = vi.fn();
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    render(<AutomationStory />);

    const section = screen.getByRole("region", {
      name: "One spark. A conversation that knows what comes next.",
    });
    expect(section.getAttribute("data-motion")).toBe("reduced");
    expect(IntersectionObserverMock).not.toHaveBeenCalled();
    expect(section.querySelectorAll("[data-flow-scene]")).toHaveLength(4);
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(4);
  });

  it("unobserves every chapter, disconnects, and removes media listeners on cleanup", () => {
    const media = installMediaQueries();
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      "IntersectionObserver",
      vi.fn(function IntersectionObserverConstructor() {
        return { observe, unobserve, disconnect };
      }),
    );

    const view = render(<AutomationStory />);
    const chapters = Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]"));
    view.unmount();

    chapters.forEach((chapter) => expect(unobserve).toHaveBeenCalledWith(chapter));
    expect(disconnect).toHaveBeenCalledTimes(1);
    media.queries.forEach((query) => {
      expect(query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });
  });
});
