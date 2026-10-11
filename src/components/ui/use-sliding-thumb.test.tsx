// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { activeThumbOption, slidingThumbRef } from "./use-sliding-thumb";

// jsdom has no layout. Each element reports the box written in its data-*
// attributes, and every element's offsetParent is its parent, as it is for a
// positioned switch in a browser.
const GEOMETRY = {
  offsetLeft: "x",
  offsetTop: "y",
  offsetWidth: "w",
  offsetHeight: "h",
  scrollWidth: "sw",
  scrollHeight: "sh",
  clientWidth: "sw",
  clientHeight: "sh",
} as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const [property, key] of Object.entries(GEOMETRY)) {
    originals.set(property, Object.getOwnPropertyDescriptor(HTMLElement.prototype, property));
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) { return Number(this.dataset[key] ?? 0); },
    });
  }
  originals.set("offsetParent", Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent"));
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) { return this.parentElement; },
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
});

afterAll(() => {
  for (const [property, descriptor] of originals) {
    if (descriptor) Object.defineProperty(HTMLElement.prototype, property, descriptor);
    else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[property];
  }
  vi.unstubAllGlobals();
});

afterEach(cleanup);

function Switch({ label = "Filter", initial = "all" }: { label?: string; initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  const options = [
    { key: "all", x: 4, w: 60 },
    { key: "active", x: 64, w: 80 },
    { key: "paused", x: 144, w: 70 },
  ];
  return (
    <>
      <div ref={slidingThumbRef} className="segmented" role="group" aria-label={label} data-sw="220" data-sh="40">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`segmented-option${value === option.key ? " is-active" : ""}`}
            aria-pressed={value === option.key}
            data-x={option.x}
            data-y="4"
            data-w={option.w}
            data-h="32"
            onClick={() => setValue(option.key)}
          >
            {option.key}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => setValue(null)}>Clear</button>
    </>
  );
}

const thumb = (name: string) => screen.getByRole("group", { name }).style;

/** Measured, and past the first-paint frame (sliding switched on). */
async function settled(name: string) {
  await waitFor(() => {
    expect(thumb(name).getPropertyValue("--thumb-w")).not.toBe("");
    expect(thumb(name).getPropertyValue("--thumb-motion")).toBe("");
  });
}

describe("useSlidingThumb", () => {
  it("measures the selected option and writes its box as clip insets", async () => {
    render(<Switch label="First paint" />);
    await waitFor(() => expect(thumb("First paint").getPropertyValue("--thumb-w")).toBe("60px"));
    const style = thumb("First paint");
    expect(style.getPropertyValue("--thumb-x")).toBe("4px");
    expect(style.getPropertyValue("--thumb-y")).toBe("4px");
    expect(style.getPropertyValue("--thumb-h")).toBe("32px");
    // 220 wide: 220 - 4 - 60 from the right, 40 - 4 - 32 from the bottom.
    expect(style.getPropertyValue("--thumb-r")).toBe("156px");
    expect(style.getPropertyValue("--thumb-b")).toBe("4px");
    expect(style.getPropertyValue("--thumb-o")).toBe("1");
    // The first paint jumps into place, then sliding is switched on.
    await waitFor(() => expect(thumb("First paint").getPropertyValue("--thumb-motion")).toBe(""));
  });

  it("glides to the new option when the selection changes", async () => {
    render(<Switch label="Glide" />);
    await settled("Glide");
    fireEvent.click(screen.getByRole("button", { name: "active" }));
    await waitFor(() => expect(thumb("Glide").getPropertyValue("--thumb-x")).toBe("64px"));
    expect(thumb("Glide").getPropertyValue("--thumb-w")).toBe("80px");
    expect(thumb("Glide").getPropertyValue("--thumb-r")).toBe("76px");
    // A plain selection change animates (no "none" override).
    expect(thumb("Glide").getPropertyValue("--thumb-motion")).toBe("");
  });

  it("fades out in place when nothing is selected, and fades back in on the new option", async () => {
    render(<Switch label="Fade" />);
    await settled("Fade");
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(thumb("Fade").getPropertyValue("--thumb-o")).toBe("0"));
    expect(thumb("Fade").getPropertyValue("--thumb-x")).toBe("4px");
    fireEvent.click(screen.getByRole("button", { name: "paused" }));
    await waitFor(() => expect(thumb("Fade").getPropertyValue("--thumb-o")).toBe("1"));
    expect(thumb("Fade").getPropertyValue("--thumb-x")).toBe("144px");
    // Reappearing is a fade at the new spot, not a slide across.
    expect(thumb("Fade").getPropertyValue("--thumb-motion")).toContain("opacity");
  });

  it("starts a re-created switch at its remembered spot, then slides", async () => {
    const first = render(<Switch label="Remembered" initial="paused" />);
    await waitFor(() => expect(thumb("Remembered").getPropertyValue("--thumb-x")).toBe("144px"));
    first.unmount();
    render(<Switch label="Remembered" initial="all" />);
    await waitFor(() => expect(thumb("Remembered").getPropertyValue("--thumb-x")).toBe("144px"));
    expect(thumb("Remembered").getPropertyValue("--thumb-motion")).toBe("none");
    await waitFor(() => expect(thumb("Remembered").getPropertyValue("--thumb-x")).toBe("4px"));
    expect(thumb("Remembered").getPropertyValue("--thumb-motion")).toBe("");
  });

  it("clears its properties when the switch goes away", async () => {
    const node = document.createElement("div");
    node.setAttribute("aria-label", "Detached");
    node.innerHTML = '<button class="is-active" data-x="2" data-w="10" data-h="10"></button>';
    document.body.appendChild(node);
    let detach: (() => void) | undefined;
    act(() => { detach = slidingThumbRef(node); });
    await waitFor(() => expect(node.style.getPropertyValue("--thumb-w")).toBe("10px"));
    detach?.();
    expect(node.style.getPropertyValue("--thumb-w")).toBe("");
    node.remove();
  });

  it("finds a checked radio's label and grouped links", () => {
    const radios = document.createElement("fieldset");
    radios.innerHTML = '<label id="monthly"><input type="radio" name="p"></label><label id="annual"><input type="radio" name="p" checked></label>';
    expect(activeThumbOption(radios)?.id).toBe("annual");
    const grouped = document.createElement("nav");
    grouped.innerHTML = '<div><a id="a">A</a></div><div><a id="b" class="is-active">B</a></div>';
    expect(activeThumbOption(grouped)?.id).toBe("b");
    // An optimistic .is-active wins over the route's aria-current.
    const optimistic = document.createElement("nav");
    optimistic.innerHTML = '<a id="current" aria-current="page">1</a><a id="pending" class="is-active">2</a>';
    expect(activeThumbOption(optimistic)?.id).toBe("pending");
  });
});
