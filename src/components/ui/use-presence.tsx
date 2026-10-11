"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Exit animations for things that are rendered conditionally (dialogs,
 * drawers, sheets, menus, toasts). When `present` turns false the element
 * stays mounted for one short closing beat with data-state="closing", so CSS
 * can play its exit keyframes, then it unmounts. Entrances need no help: they
 * are plain CSS animations that run when the element is inserted.
 *
 * The closing beat matches the motion tokens: exits run at ~70% of --dur-3
 * (340ms), and EXIT_MS leaves a few frames of slack on top of that.
 */
export const EXIT_MS = 260;

export type PresenceState = "open" | "closing";

/**
 * True when the viewer asked for reduced motion, or when there is no way to
 * ask (no matchMedia, e.g. server rendering and jsdom): without a known
 * preference nothing waits on an animation.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `mounted` stays true through the closing beat; `state` is what the element
 * puts on data-state. Reopening while closing cancels the exit.
 */
export function usePresence(present: boolean, exitMs: number = EXIT_MS): { mounted: boolean; state: PresenceState } {
  const [closing, setClosing] = useState(false);
  const [wasPresent, setWasPresent] = useState(present);

  // Adjusting state while rendering (not in an effect) so the closing frame is
  // the very next paint after `present` flips, with no unmounted gap.
  if (present !== wasPresent) {
    setWasPresent(present);
    setClosing(!present && !prefersReducedMotion());
  }

  useEffect(() => {
    if (!closing) return;
    const timer = window.setTimeout(() => setClosing(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [closing, exitMs]);

  return { mounted: present || closing, state: present ? "open" : "closing" };
}

const PresenceContext = createContext<PresenceState>("open");

/** The presence state of the nearest <Presence>; "open" outside one. */
export function usePresenceState(): PresenceState {
  return useContext(PresenceContext);
}

/**
 * Keeps its last children on screen for the closing beat after they turn
 * null/false, so call sites keep their `{open ? <Dialog /> : null}` shape:
 *
 *   <Presence>{open ? <Dialog onClose={close} /> : null}</Presence>
 *
 * The child reads usePresenceState() and sets data-state on its own root (it
 * may be portalled, so a wrapper element could not carry the attribute).
 */
export function Presence({ children, exitMs = EXIT_MS }: { children: ReactNode; exitMs?: number }) {
  const present = children !== null && children !== undefined && children !== false;
  // The closing frame must show exactly what was last on screen, so the last
  // non-empty children are kept (adjusted while rendering, like usePresence).
  const [last, setLast] = useState<ReactNode>(children);
  if (present && children !== last) setLast(children);
  const { mounted, state } = usePresence(present, exitMs);
  if (!mounted) return null;
  return <PresenceContext.Provider value={state}>{present ? children : last}</PresenceContext.Provider>;
}

/**
 * For markup that lives inline in the parent (no component of its own to
 * call usePresenceState from):
 *
 *   <Presence>{item ? <PresenceSlot>{(state) => <aside data-state={state}>…</aside>}</PresenceSlot> : null}</Presence>
 */
export function PresenceSlot({ children }: { children: (state: PresenceState) => ReactNode }) {
  return children(usePresenceState());
}

/** Spread onto an overlay's root: data-state plus inert while it leaves. */
export function presenceProps(state: PresenceState): { "data-state": PresenceState; inert?: boolean } {
  return state === "closing" ? { "data-state": state, inert: true } : { "data-state": state };
}
