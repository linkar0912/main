// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Collapse } from "./collapse";
import { EXIT_MS, Presence, prefersReducedMotion, presenceProps, usePresenceState } from "./use-presence";

function stubMotionPreference(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function Panel({ label }: { label: string }) {
  const state = usePresenceState();
  return <div role="dialog" aria-label={label} {...presenceProps(state)} />;
}

describe("Presence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps the last child for one closing beat, marked closing and inert, then unmounts", () => {
    stubMotionPreference(false);
    const view = render(<Presence>{<Panel label="Settings" />}</Presence>);
    expect(screen.getByRole("dialog").dataset.state).toBe("open");

    view.rerender(<Presence>{null}</Presence>);
    const leaving = view.container.querySelector('[aria-label="Settings"]') as HTMLElement;
    expect(leaving.dataset.state).toBe("closing");
    expect(leaving.hasAttribute("inert")).toBe(true);

    act(() => { vi.advanceTimersByTime(EXIT_MS - 1); });
    expect(view.container.querySelector('[aria-label="Settings"]')).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(view.container.querySelector('[aria-label="Settings"]')).toBeNull();
  });

  it("cancels the exit when the content comes back while closing", () => {
    stubMotionPreference(false);
    const view = render(<Presence>{<Panel label="Menu" />}</Presence>);
    view.rerender(<Presence>{false}</Presence>);
    view.rerender(<Presence>{<Panel label="Menu" />}</Presence>);
    act(() => { vi.advanceTimersByTime(EXIT_MS * 2); });
    expect(screen.getByRole("dialog").dataset.state).toBe("open");
  });

  it("unmounts at once when the viewer prefers reduced motion", () => {
    stubMotionPreference(true);
    expect(prefersReducedMotion()).toBe(true);
    const view = render(<Presence>{<Panel label="Drawer" />}</Presence>);
    view.rerender(<Presence>{null}</Presence>);
    expect(view.container.querySelector('[aria-label="Drawer"]')).toBeNull();
  });

  it("unmounts at once when the motion preference cannot be read", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(prefersReducedMotion()).toBe(true);
    const view = render(<Presence>{<Panel label="Toast" />}</Presence>);
    view.rerender(<Presence>{null}</Presence>);
    expect(view.container.querySelector('[aria-label="Toast"]')).toBeNull();
  });

  it("reports open outside a Presence", () => {
    render(<Panel label="Plain" />);
    expect(screen.getByRole("dialog").dataset.state).toBe("open");
  });
});

describe("Collapse", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("collapses with the last content still inside, then removes it", () => {
    stubMotionPreference(false);
    let open = true;
    const answer = () => (open ? <p>Replies go out within a minute.</p> : null);
    const view = render(<Collapse open={open} id="faq-1">{answer()}</Collapse>);
    const wrapper = view.container.querySelector("#faq-1") as HTMLElement;
    expect(wrapper.dataset.state).toBe("open");
    expect(wrapper.querySelector(".collapse-inner")?.textContent).toBe("Replies go out within a minute.");

    open = false;
    view.rerender(<Collapse open={open} id="faq-1">{answer()}</Collapse>);
    expect(wrapper.dataset.state).toBe("closing");
    expect(wrapper.textContent).toBe("Replies go out within a minute.");
    act(() => { vi.advanceTimersByTime(EXIT_MS); });
    expect(view.container.querySelector("#faq-1")).toBeNull();
  });
});
