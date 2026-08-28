// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetupSteps } from "./setup-steps";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SetupSteps", () => {
  it("renders the ordered three-step Linkar setup sequence with its local previews", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SetupSteps />);

    const section = screen.getByRole("region", { name: "From first connection to live flow in three clear steps." });
    expect(section.id).toBe("setup");
    expect(within(section).getByText("Linkar keeps setup focused so you can spend your judgment on the conversation.")).toBeTruthy();

    const steps = Array.from(within(section).getByRole("list").querySelectorAll(":scope > li")).filter(
      (step): step is HTMLElement => step instanceof HTMLElement,
    );
    expect(steps).toHaveLength(3);
    expect(Array.from(steps, (step) => within(step).getByRole("heading", { level: 3 }).textContent)).toEqual([
      "Connect your professional account",
      "Choose a trigger",
      "Publish the flow",
    ]);
    expect(Array.from(steps, (step) => within(step).getByText(/^0[1-3]$/).textContent)).toEqual(["01", "02", "03"]);
    expect(within(steps[0]).getByText("Authorize the messaging connection securely and confirm the account you want Linkar to use.")).toBeTruthy();
    expect(within(steps[1]).getByText("Pick the comment, message, mention, or campaign condition that should begin the flow.")).toBeTruthy();
    expect(within(steps[2]).getByText("Review the path, switch it on, and watch each conversation move through visible states.")).toBeTruthy();
    expect(Array.from(steps, (step) => within(step).getByRole("figure").getAttribute("aria-label"))).toEqual([
      "Protected Linkar connection preview",
      "Linkar trigger preview",
      "Published Linkar flow preview",
    ]);
    expect(Array.from(steps, (step) => within(step).getByRole("figure").querySelector("svg"))).not.toContain(null);
    expect(Array.from(steps, (step) => within(step).getByRole("figure").querySelector("figcaption")?.textContent)).toEqual([
      "Connection protected",
      "Trigger ready",
      "Flow live",
    ]);
    expect(within(section).queryAllByRole("button")).toHaveLength(0);
    expect(within(section).queryAllByRole("link")).toHaveLength(0);
  });

  it("leaves the complete sequence readable immediately when reduced motion is preferred", () => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<SetupSteps />);

    const section = screen.getByRole("region", { name: "From first connection to live flow in three clear steps." });
    expect(section.getAttribute("data-reduced-motion-state")).toBe("visible");
    expect(within(section).getAllByRole("figure")).toHaveLength(3);
  });
});
