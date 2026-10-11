"use client";

import { useEffect, useState } from "react";

/** True when the viewer asked the OS for less motion. False on the server. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

type Run = { to: number };

/**
 * Counts a number up from zero the first time it becomes known, then shows
 * every later value as-is: a background refresh must never replay the
 * animation. Reduced motion (or `enabled: false`) shows the value straight
 * away. Returns null while the value is unknown.
 */
export function useCountUp(target: number | null, { duration = 480, delay = 0, enabled = true }: {
  duration?: number;
  delay?: number;
  enabled?: boolean;
} = {}): number | null {
  const [run, setRun] = useState<Run | null>(null);
  const [done, setDone] = useState(false);
  const [value, setValue] = useState(0);

  // Decided during render (not in an effect) so the first frame that knows
  // the value already paints 0 instead of flashing the final number.
  if (!done && run === null && target !== null) {
    if (!enabled || target === 0 || prefersReducedMotion()) setDone(true);
    else setRun({ to: target });
  }

  useEffect(() => {
    if (!run) return;
    let frame = 0;
    let timer = 0;
    let start = 0;
    const schedule = (callback: (time: number) => void) =>
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(callback)
        : window.setTimeout(() => callback(Date.now()), 16);
    const tick = (time: number) => {
      if (!start) start = time;
      const progress = Math.min(1, (time - start) / duration);
      setValue(Math.round(run.to * easeOutCubic(progress)));
      if (progress < 1) frame = schedule(tick);
      else {
        setDone(true);
        setRun(null);
      }
    };
    timer = window.setTimeout(() => { frame = schedule(tick); }, delay);
    return () => {
      window.clearTimeout(timer);
      if (typeof window.cancelAnimationFrame === "function") window.cancelAnimationFrame(frame);
      window.clearTimeout(frame);
    };
  }, [run, duration, delay]);

  if (target === null) return null;
  if (done || !run) return target;
  return value;
}
