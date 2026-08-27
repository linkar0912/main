// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Reveal } from "./reveal";

describe("Reveal", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("marks intersecting content visible and releases observer resources", () => {
    let observerCallback: IntersectionObserverCallback | undefined;
    const observe = vi.fn();
    const unobserve = vi.fn();
    const disconnect = vi.fn();
    const observer = { observe, unobserve, disconnect } as unknown as IntersectionObserver;
    const IntersectionObserverMock = vi.fn(
      function IntersectionObserverConstructor(
        callback: IntersectionObserverCallback,
        options?: IntersectionObserverInit,
      ) {
        observerCallback = callback;
        expect(options).toEqual({
          threshold: 0.18,
          rootMargin: "0px 0px -10% 0px",
        });
        return observer;
      },
    );
    vi.stubGlobal("IntersectionObserver", IntersectionObserverMock);

    const view = render(
      <Reveal delay={80}>
        <p>Ready</p>
      </Reveal>,
    );
    const reveal = screen.getByText("Ready").closest("[data-reveal]");

    expect(reveal).not.toBeNull();
    expect(IntersectionObserverMock).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledWith(reveal);
    expect(reveal?.getAttribute("data-visible")).toBeNull();
    expect(reveal?.getAttribute("style")).toContain("--reveal-delay: 80ms");

    act(() => {
      observerCallback?.(
        [{ isIntersecting: true, target: reveal } as unknown as IntersectionObserverEntry],
        observer,
      );
    });

    expect(reveal?.getAttribute("data-visible")).toBe("true");
    expect(unobserve).toHaveBeenCalledWith(reveal);

    view.unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("leaves content readable when observers are unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(
      <Reveal>
        <p>Always readable</p>
      </Reveal>,
    );

    const reveal = screen.getByText("Always readable").closest("[data-reveal]");
    expect(reveal?.getAttribute("data-enhanced")).toBeNull();
  });

  it("renders the requested semantic wrapper and forwards standard attributes", () => {
    vi.stubGlobal("IntersectionObserver", undefined);

    render(
      <Reveal
        as="section"
        id="ready-section"
        aria-label="Ready section"
        data-tone="ink"
      >
        <p>Semantic content</p>
      </Reveal>,
    );

    const region = screen.getByRole("region", { name: "Ready section" });
    expect(region.tagName).toBe("SECTION");
    expect(region.getAttribute("id")).toBe("ready-section");
    expect(region.getAttribute("data-tone")).toBe("ink");
    expect(region.hasAttribute("data-reveal")).toBe(true);
  });
});
