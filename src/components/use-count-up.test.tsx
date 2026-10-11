// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCountUp } from "./use-count-up";

function Counter({ value }: { value: number | null }) {
  const shown = useCountUp(value, { duration: 400 });
  return <span data-testid="value">{shown === null ? "none" : String(shown)}</span>;
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
    matches: reduce && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })));
}

describe("useCountUp", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("counts up from zero the first time the value is known, then lands on it", async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    vi.stubGlobal("requestAnimationFrame", undefined);
    const view = render(<Counter value={null} />);
    expect(screen.getByTestId("value").textContent).toBe("none");

    view.rerender(<Counter value={900} />);
    // The first frame with a value paints 0, not the final number.
    expect(screen.getByTestId("value").textContent).toBe("0");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    const midway = Number(screen.getByTestId("value").textContent);
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(900);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(screen.getByTestId("value").textContent).toBe("900");
  });

  it("shows later values straight away instead of replaying", async () => {
    vi.useFakeTimers();
    stubReducedMotion(false);
    vi.stubGlobal("requestAnimationFrame", undefined);
    const view = render(<Counter value={10} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    view.rerender(<Counter value={25} />);
    expect(screen.getByTestId("value").textContent).toBe("25");
  });

  it("jumps straight to the value when the viewer prefers reduced motion", () => {
    stubReducedMotion(true);
    render(<Counter value={949} />);
    expect(screen.getByTestId("value").textContent).toBe("949");
  });
});
