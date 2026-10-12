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
 *
 * In the side column on a laptop the phone never shrinks below
 * READABLE_ZOOM because of height alone - on a short window the text inside
 * would get too small to read - so the sticky column scrolls instead. Only
 * the column's width can take it lower. The full-screen sheet on phones keeps
 * fitting the whole device to the screen.
 */

/** Design size of the whole device, bezel included (px). */
export const PHONE_DESIGN_WIDTH = 318;
export const PHONE_DESIGN_HEIGHT = Math.round(300 * (852 / 393)) + 18;

const MIN_ZOOM = 0.5;
/** Smallest zoom the desktop side column allows for lack of height. */
export const READABLE_ZOOM = 0.85;
/** Room kept under the phone for the caption line and breathing space. */
const BELOW_PHONE = 56;

export function phoneZoom(availableWidth: number, availableHeight: number, heightFloor = MIN_ZOOM): number {
  if (!(availableWidth > 0) || !(availableHeight > 0)) return 1;
  const across = availableWidth / PHONE_DESIGN_WIDTH;
  const down = Math.max(availableHeight / PHONE_DESIGN_HEIGHT, heightFloor);
  const fit = Math.min(across, down, 1);
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
  // The panel scrolls inside on short windows: measure from its content top.
  const deviceOffset = device.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  const panelStyle = getComputedStyle(panel);
  // The side column is capped a little short of the window (max-height).
  const room = Math.min(window.innerHeight - stickyTop(panel), parseFloat(panelStyle.maxHeight) || Infinity);
  const availableHeight = room - deviceOffset - BELOW_PHONE;
  const isSheet = panelStyle.position === "fixed";
  const zoom = phoneZoom(frame.clientWidth, availableHeight, isSheet ? MIN_ZOOM : READABLE_ZOOM);
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
