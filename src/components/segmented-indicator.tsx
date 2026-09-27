"use client";

import { useEffect } from "react";

const ACTIVE = [
  ".segmented-option.is-on",
  ".segmented-option.is-active",
  '.segmented-option[aria-pressed="true"]',
  '.segmented-option[aria-selected="true"]',
];
const ACTIVE_WITH_RADIO = [...ACTIVE, ".segmented-option:has(input:checked)"];

type Box = { x: number; y: number; w: number; h: number };
type State = { box: Box; animate: boolean };

// Keyed by the switch's aria-label. Survives remounts, so a switch that is
// re-created on navigation slides from where it was instead of popping.
const states = new Map<string, State>();
const seen = new WeakSet<Element>();
const targets = new Map<string, Box>();

function activeOption(control: Element): HTMLElement | null {
  // Priority order, not document order: an optimistic .is-active wins.
  for (const selector of ACTIVE) {
    const found = control.querySelector<HTMLElement>(`:scope > ${selector}`);
    if (found) return found;
  }
  return control.querySelector<HTMLInputElement>(":scope > .segmented-option > input:checked")?.parentElement ?? null;
}

function quote(value: string): string {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

function ruleFor(label: string, { box, animate }: State): string {
  const scope = `.segmented[aria-label=${quote(label)}]`;
  return `${scope}::before{content:"";width:${box.w}px;height:${box.h}px;transform:translate(${box.x}px,${box.y}px);${animate ? "" : "transition:none;"}}`
    + `${scope} :is(${ACTIVE_WITH_RADIO.join(",")}){background:transparent!important;}`;
}

/**
 * Sliding thumb behind every `.segmented` switch. It never writes to React-
 * owned DOM (that caused hydration mismatches): geometry goes into one
 * <style> element in <head>, one rule per switch keyed by its aria-label.
 */
export function SegmentedIndicator() {
  useEffect(() => {
    const style = document.createElement("style");
    style.dataset.segmentedIndicator = "";
    document.head.appendChild(style);

    let frame = 0;
    const render = () => {
      style.textContent = [...states.entries()]
        .filter(([label]) => document.querySelector(`.segmented[aria-label=${quote(label)}]`))
        .map(([label, state]) => ruleFor(label, state))
        .join("\n");
    };
    const measureAll = () => {
      frame = 0;
      const enable: string[] = [];
      document.querySelectorAll<HTMLElement>(".segmented[aria-label]").forEach((control) => {
        const label = control.getAttribute("aria-label") ?? "";
        const option = activeOption(control);
        if (!option) {
          states.delete(label);
          return;
        }
        const box = { x: option.offsetLeft, y: option.offsetTop, w: option.offsetWidth, h: option.offsetHeight };
        const previous = states.get(label);
        if (!seen.has(control)) {
          seen.add(control);
          // New element: paint at the remembered spot (or the target itself)
          // with no transition, then glide to the target on the next frame.
          states.set(label, { box: previous?.box ?? box, animate: false });
          targets.set(label, box);
          enable.push(label);
        } else {
          states.set(label, { box, animate: true });
        }
      });
      render();
      if (enable.length) {
        requestAnimationFrame(() => {
          for (const label of enable) {
            const target = targets.get(label);
            if (target) states.set(label, { box: target, animate: true });
          }
          render();
        });
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measureAll);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-pressed", "aria-selected", "aria-current", "hidden"],
    });
    document.addEventListener("change", schedule, true);
    window.addEventListener("resize", schedule);
    document.fonts?.ready.then(schedule).catch(() => undefined);
    return () => {
      observer.disconnect();
      document.removeEventListener("change", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      style.remove();
    };
  }, []);
  return null;
}
