// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SurfaceRunway } from "./surface-runway";

type MediaQueryListener = (event: MediaQueryListEvent) => void;

function installMediaQueries({ desktop = true, reducedMotion = false } = {}) {
  const queries = new Map<string, MediaQueryList>();
  vi.stubGlobal("matchMedia", vi.fn((query: string) => {
    const queryList = {
      matches: query === "(min-width: 1024px)" ? desktop : reducedMotion,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: "change", _listener: MediaQueryListener) => undefined),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    queries.set(query, queryList);
    return queryList;
  }));
  return queries;
}

function installAnimationFrame() {
  let nextFrame = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const frame = nextFrame++;
    callbacks.set(frame, callback);
    return frame;
  });
  const cancelAnimationFrame = vi.fn((frame: number) => callbacks.delete(frame));
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

  return {
    requestAnimationFrame,
    cancelAnimationFrame,
    flushFrame() {
      const frame = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      if (!frame) throw new Error("No animation frame is scheduled");
      callbacks.delete(frame[0]);
      act(() => frame[1](performance.now()));
    },
  };
}

function sectionRect(progress: number): DOMRect {
  const height = 3200;
  const viewportHeight = 1000;
  const top = -progress * (height - viewportHeight);
  return {
    x: 0, y: top, top, right: 1440, bottom: top + height, left: 0,
    width: 1440, height, toJSON: () => ({}),
  };
}

describe("SurfaceRunway", () => {
  beforeEach(() => {
    vi.stubGlobal("innerHeight", 1000);
    installMediaQueries();
    installAnimationFrame();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders four informational surface cards with their exact copy and labelled local previews", () => {
    render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Meet people where the conversation starts." });

    expect(section.id).toBe("surfaces");
    expect(within(section).getByText("Choose the signal. Linkar gives every response a deliberate next step.")).toBeTruthy();
    const cards = within(section).getAllByRole("article");
    expect(cards).toHaveLength(4);
    expect(cards.map((card) => card.querySelector("h3")?.textContent)).toEqual([
      "Comment triggers", "DM triggers", "Story mentions", "Follow-gated campaigns",
    ]);
    expect(cards.map((card) => card.querySelector("p")?.textContent)).toEqual([
      "Turn a chosen word beneath a post into a relevant private reply.",
      "Recognize an incoming phrase and guide the conversation from the first message.",
      "Acknowledge a mention while the moment is still warm.",
      "Check the condition before releasing the promised next step.",
    ]);
    expect(within(section).getAllByRole("figure")).toHaveLength(4);
    expect(Array.from(section.querySelectorAll("figure")).every((preview) => preview.hasAttribute("data-reveal"))).toBe(true);
    expect(within(section).getAllByText("Comment → Keyword rule → Reply")).toHaveLength(1);
    expect(section.querySelectorAll("a, button, [draggable='true']")).toHaveLength(0);
  });

  it("writes the exact clamped vertical-scroll progress in a coalesced desktop frame", () => {
    const frames = installAnimationFrame();
    render(<SurfaceRunway />);
    const section = screen.getByRole("region", { name: "Meet people where the conversation starts." });
    vi.spyOn(section, "getBoundingClientRect").mockReturnValue(sectionRect(.42));

    frames.flushFrame();
    expect(Number(section.style.getPropertyValue("--runway-progress"))).toBeCloseTo(.42, 4);

    vi.spyOn(section, "getBoundingClientRect").mockReturnValue(sectionRect(-.4));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2);
    frames.flushFrame();
    expect(section.style.getPropertyValue("--runway-progress")).toBe("0");

    vi.spyOn(section, "getBoundingClientRect").mockReturnValue(sectionRect(1.4));
    window.dispatchEvent(new Event("scroll"));
    frames.flushFrame();
    expect(section.style.getPropertyValue("--runway-progress")).toBe("1");
  });

  it("uses document flow without scroll work outside desktop and under reduced motion", () => {
    installMediaQueries({ desktop: false });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const frames = installAnimationFrame();
    const mobile = render(<SurfaceRunway />);
    const mobileSection = screen.getByRole("region", { name: "Meet people where the conversation starts." });
    expect(mobileSection.getAttribute("data-runway-mode")).toBe("flow");
    expect(addEventListener).not.toHaveBeenCalledWith("scroll", expect.any(Function), expect.anything());
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
    mobile.unmount();

    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.stubGlobal("innerHeight", 1000);
    installMediaQueries({ desktop: true, reducedMotion: true });
    const reducedAddEventListener = vi.spyOn(window, "addEventListener");
    const reducedFrames = installAnimationFrame();
    render(<SurfaceRunway />);
    const reducedSection = screen.getByRole("region", { name: "Meet people where the conversation starts." });
    expect(reducedSection.getAttribute("data-runway-mode")).toBe("reduced");
    expect(reducedSection.getAttribute("data-reduced-motion-state")).toBe("static");
    expect(reducedAddEventListener).not.toHaveBeenCalledWith("scroll", expect.any(Function), expect.anything());
    expect(reducedFrames.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("uses a two-column, transform-free grid at 768px and 900px", () => {
    const stylesheet = readFileSync(path.join(process.cwd(), "src/components/marketing/surface-runway.module.css"), "utf8");
    const tabletRule = stylesheet.match(/@media \(min-width: 768px\) and \(max-width: 1023px\) \{([\s\S]*?)\n\}/)?.[1];

    expect(tabletRule).toContain(".track { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding: 0; }");
    expect(tabletRule).not.toContain("transform:");
  });

  it("registers passive listeners only for desktop motion and fully cleans them up", () => {
    const mediaQueries = installMediaQueries();
    const frames = installAnimationFrame();
    const addEventListener = vi.spyOn(window, "addEventListener");
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const view = render(<SurfaceRunway />);

    expect(addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), { passive: true });
    expect(addEventListener).toHaveBeenCalledWith("resize", expect.any(Function), { passive: true });
    view.unmount();
    expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    mediaQueries.forEach((query) => expect(query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function)));
  });
});
