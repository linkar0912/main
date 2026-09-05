// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutomationStory } from "./automation-story";

type MediaQueryListener = (event: MediaQueryListEvent) => void;

function installMediaQueries({ desktop = true, reducedMotion = false } = {}) {
  const queries = new Map<string, MediaQueryList>();
  const matchMedia = vi.fn((query: string) => {
    const matches = query === "(min-width: 1024px)" ? desktop : reducedMotion;
    const mediaQuery = {
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn((_type: "change", _listener: MediaQueryListener) => undefined),
      removeEventListener: vi.fn((_type: "change", _listener: MediaQueryListener) => undefined),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    } as unknown as MediaQueryList;
    queries.set(query, mediaQuery);
    return mediaQuery;
  });
  vi.stubGlobal("matchMedia", matchMedia);
  return { queries };
}

function installAnimationFrame() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    const id = nextId++;
    callbacks.set(id, callback);
    return id;
  });
  const cancelAnimationFrame = vi.fn((id: number) => callbacks.delete(id));
  vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
  vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

  function flushFrame() {
    const frame = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
    if (!frame) throw new Error("No animation frame is scheduled");
    callbacks.delete(frame[0]);
    act(() => frame[1](performance.now()));
  }

  return { requestAnimationFrame, cancelAnimationFrame, callbacks, flushFrame };
}

function storyRect(progress: number): DOMRect {
  const height = 4000;
  const activationLine = 1000 * 0.45;
  const top = activationLine - progress * height;
  return {
    x: 0,
    y: top,
    top,
    right: 1440,
    bottom: top + height,
    left: 0,
    width: 1440,
    height,
    toJSON: () => ({}),
  };
}

describe("AutomationStory", () => {
  beforeEach(() => {
    installMediaQueries();
    installAnimationFrame();
    vi.stubGlobal("innerHeight", 1000);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("server-renders exact ordered Linkar chapters and one semantic scene summary", () => {
    const markup = renderToStaticMarkup(<AutomationStory />);
    render(<AutomationStory />);
    const section = screen.getByRole("region", { name: "From the first comment to the right next step." });
    expect(section.id).toBe("how-it-works");
    expect(section.getAttribute("data-active-scene")).toBe("comment");
    expect(section.getAttribute("data-active-index")).toBe("0");
    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual([
      "Reply right away", "Ask one useful question", "Follow up at the right time", "Let your team take over",
    ]);
    expect(Array.from(section.querySelectorAll("[data-sequence]")).map((number) => number.textContent)).toEqual(["01", "02", "03", "04"]);
    expect(Array.from(section.querySelectorAll("[data-chapter-copy]")).map((copy) => copy.textContent)).toEqual([
      "When someone leaves the comment you are looking for, Linkar privately sends the reply you wrote.",
      "Find out what someone needs, save their answer, and send the most helpful next message.",
      "Schedule a friendly reminder while the conversation is still open. Linkar remembers when to send it.",
      "When someone needs a personal answer, pause automatic replies and keep the conversation ready for your team.",
    ]);
    [
      "GUIDE please", "GUIDE recognized", "The quick guide is ready. What would you like to improve first?",
      "More replies or better leads?", "Better leads", "Answer remembered", "Now: guide sent",
      "+ 18h: check in", "Ready to send", "Project details received", "Automatic replies paused", "Ready for your team",
    ].forEach((state) => expect(markup).toContain(state));
    expect(screen.getAllByRole("figure", { name: "Linkar reply preview in an iPhone conversation" })).toHaveLength(1);
    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(section.querySelectorAll('[data-device-frame="iphone"]')).toHaveLength(5);
    expect(section.querySelectorAll('[data-social-interface="true"]')).toHaveLength(5);
    ["9:41", "87%", "Comments", "Reply", "Add a comment…"].forEach((detail) => {
      expect(markup).toContain(detail);
    });
    expect(section.querySelectorAll('[aria-hidden="true"] [data-scene-body]')).toHaveLength(8);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("keeps one stable desktop frame while four scene bodies crossfade", () => {
    render(<AutomationStory />);
    const stage = document.querySelector("[data-desktop-stage]");
    expect(stage?.querySelectorAll("[data-scene-frame]")).toHaveLength(1);
    expect(stage?.querySelectorAll("[data-scene]")).toHaveLength(4);
    expect(stage?.querySelector('[data-scene="comment"]')?.getAttribute("data-active")).toBe("true");
    expect(stage?.querySelector('[data-scene="qualify"]')?.getAttribute("data-active")).toBe("false");
    stage?.querySelectorAll("[data-scene]").forEach((scene) => {
      expect(scene.querySelectorAll('[data-current-action="true"]')).toHaveLength(1);
    });
  });

  it("maps exact progress bands using the 45% viewport activation line", () => {
    const frames = installAnimationFrame();
    render(<AutomationStory />);
    const section = screen.getByRole("region", { name: "From the first comment to the right next step." });
    const storyBody = section.querySelector<HTMLElement>("[data-story-body]");
    expect(storyBody).not.toBeNull();
    const cases: Array<[number, string, string]> = [
      [0, "0", "comment"], [0.2499, "0", "comment"], [0.25, "1", "qualify"],
      [0.4999, "1", "qualify"], [0.5, "2", "followup"], [0.7499, "2", "followup"],
      [0.75, "3", "handoff"], [1, "3", "handoff"],
    ];
    for (const [progress, index, scene] of cases) {
      vi.spyOn(storyBody!, "getBoundingClientRect").mockReturnValue(storyRect(progress));
      window.dispatchEvent(new Event("scroll"));
      frames.flushFrame();
      expect(section.getAttribute("data-active-index")).toBe(index);
      expect(section.getAttribute("data-active-scene")).toBe(scene);
      expect(section.style.getPropertyValue("--story-index")).toBe(index);
      expect(Number(section.style.getPropertyValue("--story-progress"))).toBeCloseTo(progress, 4);
    }
  });

  it("coalesces passive scroll and resize work into one animation frame", () => {
    const frames = installAnimationFrame();
    const addEventListener = vi.spyOn(window, "addEventListener");
    render(<AutomationStory />);
    expect(addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), { passive: true });
    expect(addEventListener).toHaveBeenCalledWith("resize", expect.any(Function), { passive: true });
    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(1);
    frames.flushFrame();
    window.dispatchEvent(new Event("resize"));
    expect(frames.requestAnimationFrame).toHaveBeenCalledTimes(2);
  });

  it("places each tablet/mobile scene immediately after matching copy in document order", () => {
    installMediaQueries({ desktop: false });
    render(<AutomationStory />);
    Array.from(document.querySelectorAll<HTMLElement>("[data-chapter]")).forEach((chapter, index) => {
      const copy = chapter.querySelector("[data-chapter-copy]");
      const scene = chapter.querySelector("[data-flow-scene]");
      expect(copy?.nextElementSibling).toBe(scene);
      expect(scene?.getAttribute("data-flow-scene")).toBe(["comment", "qualify", "followup", "handoff"][index]);
    });
  });

  it("renders the complete reduced-motion flow without registering scroll work", () => {
    installMediaQueries({ desktop: true, reducedMotion: true });
    const addEventListener = vi.spyOn(window, "addEventListener");
    const frames = installAnimationFrame();
    render(<AutomationStory />);
    const section = screen.getByRole("region", { name: "From the first comment to the right next step." });
    expect(section.getAttribute("data-motion")).toBe("reduced");
    expect(section.querySelectorAll("[data-flow-scene]")).toHaveLength(4);
    expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(addEventListener).not.toHaveBeenCalledWith("scroll", expect.any(Function), expect.anything());
    expect(addEventListener).not.toHaveBeenCalledWith("resize", expect.any(Function), expect.anything());
    expect(frames.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it("gates the chat motion on visibility and disables it entirely for reduced motion", () => {
    const stylesheet = readFileSync(
      path.join(process.cwd(), "src/components/marketing/automation-story.module.css"),
      "utf8",
    );

    // Nothing animates until a scene is the active one on the stage, or the
    // inline phone has been scrolled to - otherwise four threads would be
    // replaying off-screen at once.
    expect(stylesheet).toContain('.desktopScene[data-active="true"] .screen > *');
    expect(stylesheet).toContain('.mobileScene[data-visible="true"] .screen > *');

    // Offsets travel as a custom property, because the gated shorthand outranks
    // a bare nth-child rule and would reset animation-delay to zero.
    expect(stylesheet).toMatch(/animation:\s*chatIn[^;]*var\(--d, 0ms\)/);
    expect(stylesheet).toContain(".screen > *:nth-child(1) { --d: 100ms; }");

    const reducedMotion = stylesheet.slice(stylesheet.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain("animation: none !important;");
    expect(reducedMotion).toMatch(/\.typing \{\s*display: none;/);
  });

  it("removes listeners, cancels pending work, and cleans media listeners", () => {
    const media = installMediaQueries();
    const frames = installAnimationFrame();
    const removeEventListener = vi.spyOn(window, "removeEventListener");
    const view = render(<AutomationStory />);
    view.unmount();
    expect(removeEventListener).toHaveBeenCalledWith("scroll", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(frames.cancelAnimationFrame).toHaveBeenCalledTimes(1);
    media.queries.forEach((query) => {
      expect(query.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    });
  });
});
