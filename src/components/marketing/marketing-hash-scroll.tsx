"use client";

import { useEffect } from "react";

/*
 * Lands links like /#how-it-works on their section.
 *
 * A client navigation to the homepage commits the loading skeleton first. The
 * router looks for the hash target in that skeleton, finds nothing, counts the
 * scroll as handled and leaves the page at the top. Once the homepage itself
 * has mounted, this scrolls to the target instead.
 *
 * It stays out of the browser's way when the browser owns the position: a
 * reload or Back/Forward that loaded this document restores where the reader
 * was, and so does a Back/Forward between pages of the app (popstate).
 */

let lastTraversal = -Infinity;
let mountedInThisDocument = false;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastTraversal = performance.now();
  });
}

function documentWasRestored(): boolean {
  if (typeof performance.getEntriesByType !== "function") return false;
  const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  if (!entry || (entry.type !== "reload" && entry.type !== "back_forward")) return false;
  return new URL(entry.name, window.location.href).pathname === window.location.pathname;
}

export function MarketingHashScroll() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id || id === "top") return;
    const frame = window.requestAnimationFrame(() => {
      // Set here rather than in the effect body, so a development double-mount counts once.
      const firstMount = !mountedInThisDocument;
      mountedInThisDocument = true;
      if ((firstMount && documentWasRestored()) || performance.now() - lastTraversal < 1_500) return;
      // Instant, like a fragment load: a smooth scroll across the whole page could land early while it renders.
      document.getElementById(id)?.scrollIntoView({ behavior: "instant", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return null;
}
