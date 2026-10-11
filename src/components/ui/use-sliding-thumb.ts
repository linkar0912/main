"use client";

import { useCallback } from "react";

/**
 * One selection thumb that glides between options (segmented switches, tab
 * rows, the sidebar). The hook measures the selected child with offsetLeft /
 * offsetTop / offsetWidth / offsetHeight - layout positions, unaffected by
 * transforms or scrolling - and writes them as CSS custom properties on the
 * container. CSS draws the thumb as a ::before/::after layer clipped to that
 * box with clip-path, so moving it never touches layout.
 *
 * Written properties (all px unless noted):
 *   --thumb-x / --thumb-y / --thumb-w / --thumb-h   the selected option's box
 *   --thumb-r / --thumb-b                           insets from the right / bottom edge
 *   --thumb-sw / --thumb-sh                         the container's scroll size
 *   --thumb-o                                       1 while something is selected, else 0
 *   --thumb-motion                                  "none" for one frame when the thumb must
 *                                                   jump (first paint), so it never slides in from 0,0
 *
 * The container must be the options' offsetParent (position: relative).
 * Only the container's inline custom properties change; React-owned
 * attributes are never touched, so there is nothing to mismatch on hydration
 * (the hook runs from a ref callback, after React owns the node).
 */

const ACTIVE = [
  ".is-active",
  ".is-on",
  '[aria-current="page"]',
  '[aria-current="step"]',
  '[aria-selected="true"]',
  '[aria-pressed="true"]',
];

type Box = { x: number; y: number; w: number; h: number; sw: number; sh: number };

// Where each named control's thumb last sat. A control that is re-created on
// navigation (the same switch on a sibling page) slides from there instead of
// popping into place.
const remembered = new Map<string, Box>();

/**
 * The selected option: a direct child (or a grandchild, for grouped navs),
 * ordered by priority, then a checked radio's label.
 */
export function activeThumbOption(container: HTMLElement): HTMLElement | null {
  for (const depth of [":scope >", ":scope > * >"]) {
    for (const selector of ACTIVE) {
      const found = container.querySelector<HTMLElement>(`${depth} ${selector}`);
      if (found) return found;
    }
  }
  return container.querySelector<HTMLInputElement>(":scope > * > input:checked")?.parentElement ?? null;
}

function measure(container: HTMLElement, option: HTMLElement): Box | null {
  const w = option.offsetWidth;
  const h = option.offsetHeight;
  // Hidden (display: none somewhere up the tree): nothing to measure yet.
  if (!w || !h) return null;
  let x = option.offsetLeft;
  let y = option.offsetTop;
  if (option.offsetParent !== container) {
    // Container not positioned (or the option sits in a positioned group):
    // fall back to client rects, in the container's scrolled content box.
    const from = container.getBoundingClientRect();
    const to = option.getBoundingClientRect();
    x = to.left - from.left - container.clientLeft + container.scrollLeft;
    y = to.top - from.top - container.clientTop + container.scrollTop;
  }
  return {
    x,
    y,
    w,
    h,
    sw: Math.max(container.scrollWidth, container.clientWidth),
    sh: Math.max(container.scrollHeight, container.clientHeight),
  };
}

function write(container: HTMLElement, box: Box, visible: boolean, motion: "none" | "fade" | "slide") {
  const style = container.style;
  const px = (value: number) => `${Math.round(value * 100) / 100}px`;
  style.setProperty("--thumb-x", px(box.x));
  style.setProperty("--thumb-y", px(box.y));
  style.setProperty("--thumb-w", px(box.w));
  style.setProperty("--thumb-h", px(box.h));
  style.setProperty("--thumb-r", px(box.sw - box.x - box.w));
  style.setProperty("--thumb-b", px(box.sh - box.y - box.h));
  style.setProperty("--thumb-sw", px(box.sw));
  style.setProperty("--thumb-sh", px(box.sh));
  style.setProperty("--thumb-o", visible ? "1" : "0");
  if (motion === "slide") style.removeProperty("--thumb-motion");
  else style.setProperty("--thumb-motion", motion === "none" ? "none" : "opacity var(--dur-2) var(--ease-out)");
}

const PROPERTIES = ["x", "y", "w", "h", "r", "b", "sw", "sh", "o", "motion"].map((name) => `--thumb-${name}`);

/**
 * Starts tracking `container`; returns the cleanup. Exported for tests and
 * for the rare caller that cannot use the hook.
 */
export function attachSlidingThumb(container: HTMLElement, memoryKey?: string): () => void {
  let frame = 0;
  let settle = 0;
  let last: Box | null = memoryKey ? remembered.get(memoryKey) ?? null : null;
  // "fresh" until the first measurement; "shown" / "hidden" afterwards.
  let phase: "fresh" | "shown" | "hidden" = "fresh";

  const enableSlide = (box: Box) => {
    settle = requestAnimationFrame(() => {
      settle = 0;
      write(container, box, true, "slide");
    });
  };

  const update = () => {
    frame = 0;
    const option = activeThumbOption(container);
    const box = option ? measure(container, option) : null;
    if (!box) {
      // Nothing selected: fade out where it stands.
      if (option === null && last && phase === "shown") write(container, last, false, "slide");
      if (option === null && phase !== "fresh") phase = "hidden";
      return;
    }
    if (phase === "fresh" && last) {
      // Re-created control: appear at the remembered spot, then glide.
      write(container, last, true, "none");
      enableSlide(box);
    } else if (phase === "fresh") {
      // First paint: sit on the selection, no slide from the corner.
      write(container, box, true, "none");
      enableSlide(box);
    } else if (phase === "hidden") {
      // Selection came back after none: jump into place and fade in.
      write(container, box, true, "fade");
      enableSlide(box);
    } else if (!settle) {
      write(container, box, true, "slide");
    } else {
      // Still inside the settle frame: let it land on the new target.
      cancelAnimationFrame(settle);
      enableSlide(box);
    }
    phase = "shown";
    last = box;
    if (memoryKey) remembered.set(memoryKey, box);
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  schedule();
  const mutations = new MutationObserver(schedule);
  mutations.observe(container, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "aria-pressed", "aria-selected", "aria-current", "hidden", "checked"],
  });
  const resize = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;
  resize?.observe(container);
  container.addEventListener("change", schedule);
  window.addEventListener("resize", schedule);
  document.fonts?.ready.then(schedule).catch(() => undefined);

  return () => {
    mutations.disconnect();
    resize?.disconnect();
    container.removeEventListener("change", schedule);
    window.removeEventListener("resize", schedule);
    if (frame) cancelAnimationFrame(frame);
    if (settle) cancelAnimationFrame(settle);
    for (const property of PROPERTIES) container.style.removeProperty(property);
  };
}

/**
 * Ready-made ref callback (stable identity, so React attaches it once):
 * `<div className="segmented" aria-label="…" ref={slidingThumbRef}>`.
 * The thumb is remembered by the container's aria-label.
 */
export function slidingThumbRef(node: HTMLElement | null): (() => void) | undefined {
  if (!node) return undefined;
  return attachSlidingThumb(node, node.getAttribute("aria-label") ?? undefined);
}

/**
 * Ref callback for a container whose selected child should carry a gliding
 * thumb, with an explicit memory key (defaults to the aria-label).
 */
export function useSlidingThumb<T extends HTMLElement>(memoryKey?: string): (node: T | null) => (() => void) | undefined {
  return useCallback((node: T | null) => {
    if (!node) return undefined;
    return attachSlidingThumb(node, memoryKey ?? node.getAttribute("aria-label") ?? undefined);
  }, [memoryKey]);
}
