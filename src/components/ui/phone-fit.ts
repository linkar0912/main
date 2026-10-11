"use client";

/**
 * Keeps a preview phone at real-phone proportions and scales it as one piece.
 *
 * The device is always laid out at its design size - a 300px-wide screen with
 * an iPhone's 393:852 shape inside an 18px bezel - so the Instagram and
 * Facebook screens never re-wrap, clip the clock or cramp their header when
 * there is less room. To fit, the whole device is zoomed down evenly (CSS
 * `zoom`, which also shrinks the space it takes in the layout), like looking
 * at a screenshot of a phone rather than a squashed phone.
 *
 * The scale is the smaller of the room across (the preview column) and the
 * room down (from the device's top edge, while the preview is stuck, to the
 * bottom of the window, less the caption under the phone). It is written as
 * `--phone-zoom` on the device, so CSS stays the only thing that styles it.
 */

/** Design size of the whole device, bezel included (px). */
export const PHONE_DESIGN_WIDTH = 318;
export const PHONE_DESIGN_HEIGHT = Math.round(300 * (852 / 393)) + 18;

const MIN_ZOOM = 0.5;
/** Room kept under the phone for the caption line and breathing space. */
const BELOW_PHONE = 56;

export function phoneZoom(availableWidth: number, availableHeight: number): number {
  if (!(availableWidth > 0) || !(availableHeight > 0)) return 1;
  const fit = Math.min(availableWidth / PHONE_DESIGN_WIDTH, availableHeight / PHONE_DESIGN_HEIGHT, 1);
  return Math.max(MIN_ZOOM, Math.floor(fit * 1000) / 1000);
}

function stickyTop(element: HTMLElement | null): number {
  for (let node = element; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    // The resting offset from the top of the window, from computed style
    // rather than the box, so a sheet that is still sliding in measures
    // where it will settle.
    if (style.position === "sticky" || style.position === "fixed") return parseFloat(style.top) || 0;
  }
  return 0;
}

function apply(device: HTMLElement) {
  const frame = device.parentElement;
  if (!frame) return;
  // Hidden (the phone sheet is closed): keep the last scale.
  if (frame.offsetParent === null && getComputedStyle(frame).position !== "fixed") return;
  const panel = device.closest<HTMLElement>(".builder-preview") ?? frame;
  const deviceOffset = device.getBoundingClientRect().top - panel.getBoundingClientRect().top;
  const availableHeight = window.innerHeight - stickyTop(panel) - deviceOffset - BELOW_PHONE;
  const zoom = phoneZoom(frame.clientWidth, availableHeight);
  device.style.setProperty("--phone-zoom", String(zoom));
}

/** Ref callback for `.ig-device` / `.facebook-device`. */
export function phoneFitRef(device: HTMLElement | null) {
  if (!device || typeof window === "undefined") return;
  let frame = 0;
  const schedule = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => apply(device));
  };
  apply(device);
  const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
  if (observer && device.parentElement) observer.observe(device.parentElement);
  const panel = device.closest<HTMLElement>(".builder-preview");
  if (observer && panel) observer.observe(panel);
  window.addEventListener("resize", schedule);
  // The phone sheet slides in: measure again once it has settled.
  panel?.addEventListener("animationend", schedule);
  panel?.addEventListener("transitionend", schedule);
  return () => {
    cancelAnimationFrame(frame);
    observer?.disconnect();
    window.removeEventListener("resize", schedule);
    panel?.removeEventListener("animationend", schedule);
    panel?.removeEventListener("transitionend", schedule);
  };
}
