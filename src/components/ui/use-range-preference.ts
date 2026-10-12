"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_RANGE, parseRange, type AnalyticsRange } from "@/src/lib/analytics-range";

/** The query parameter that carries the range: `?range=7`. */
export const RANGE_PARAM = "range";

function readStored(key: string): AnalyticsRange | null {
  try {
    return parseRange(window.localStorage.getItem(key));
  } catch {
    // Private windows and blocked storage throw; the default is fine there.
    return null;
  }
}

function writeStored(key: string, range: AnalyticsRange): void {
  try {
    window.localStorage.setItem(key, String(range));
  } catch {
    // Remembering the choice is a convenience, never a requirement.
  }
}

/**
 * Mirrors the range into the address bar without a navigation. The default
 * keeps the plain URL, so a shared link to a 14-day view stays tidy; Next's
 * router picks up native history calls, so back/forward keep working.
 */
function writeUrl(range: AnalyticsRange): void {
  try {
    const url = new URL(window.location.href);
    if (range === DEFAULT_RANGE) url.searchParams.delete(RANGE_PARAM);
    else url.searchParams.set(RANGE_PARAM, String(range));
    const next = `${url.pathname}${url.search}${url.hash}`;
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", next);
    }
  } catch {
    // A sandboxed frame may refuse history writes; the switch still works.
  }
}

/**
 * The 7 / 14 / 30-day choice for one analytics view, per viewer: the URL
 * (`?range=7`) wins, then what this browser last picked (localStorage under
 * `storageKey`), then 14 days. `initialRange` is what the server read from
 * the URL, so the first paint already shows the right switch position; the
 * stored choice is applied after mount (it can't be known on the server).
 */
export function useRangePreference(storageKey: string, initialRange?: AnalyticsRange | null): {
  range: AnalyticsRange;
  setRange: (range: AnalyticsRange) => void;
  /** False until the URL and saved choice have been read; load data once it is true, not before. */
  ready: boolean;
} {
  const [state, setState] = useState<{ range: AnalyticsRange; ready: boolean }>({ range: initialRange ?? DEFAULT_RANGE, ready: false });
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const fromUrl = parseRange(new URLSearchParams(window.location.search).get(RANGE_PARAM));
    const preferred = fromUrl ?? readStored(storageKey);
    if (preferred !== null && fromUrl === null) writeUrl(preferred);
    // Restoring a saved choice after hydration (it can't be read on the
    // server); one render, and nothing has fetched for the default yet.
    setState((current) => ({ range: preferred ?? current.range, ready: true }));
  }, [storageKey]);

  const setRange = useCallback((next: AnalyticsRange) => {
    setState({ range: next, ready: true });
    writeStored(storageKey, next);
    writeUrl(next);
  }, [storageKey]);

  return { range: state.range, setRange, ready: state.ready };
}
