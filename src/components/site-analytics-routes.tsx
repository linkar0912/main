"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { redactAnalyticsPath } from "@/src/lib/analytics-path";

declare global {
  interface Window {
    gtag?: (command: string, ...args: unknown[]) => void;
  }
}

/**
 * Sends the page_view that gtag's own automatic tracking is turned off for.
 *
 * Doing it by hand is what lets the path be redacted first - GA's built-in
 * page_view reads document.location directly, which would ship the raw URL
 * (and any id in it) before this code could intervene.
 *
 * The gtag('set', ...) call matters just as much as the event. GA4's enhanced
 * measurement sends its own events (scroll, click, file_download) and each one
 * reads document.location unless a default page_location has been set. Without
 * the set call a scroll on /data-deletion/status/<code> ships the raw code even
 * though the page_view beside it was clean - verified against the network log.
 */
export function SiteAnalyticsRoutes({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const path = redactAnalyticsPath(pathname ?? "/");
    if (previous.current === path) return;

    let cancelled = false;
    let attempts = 0;
    let timer: number | undefined;

    // The GA script is often still loading on the first navigation; retry
    // briefly instead of silently dropping that page_view, but cap the attempts
    // so an blocked/absent gtag does not keep a timer alive forever.
    const send = () => {
      if (cancelled) return;
      if (typeof window.gtag !== "function") {
        attempts += 1;
        if (attempts >= 40) return;
        timer = window.setTimeout(send, 250);
        return;
      }

      const location = `${window.location.origin}${path}`;

      // Applies to every later event, including ones GA sends on its own.
      window.gtag("set", { page_path: path, page_location: location, page_title: document.title });

      window.gtag("event", "page_view", {
        page_path: path,
        page_location: location,
        page_title: document.title,
        // Same treatment for the referrer, which is a full in-app URL on any
        // navigation after the first.
        page_referrer: previous.current ? `${window.location.origin}${previous.current}` : undefined,
      });

      previous.current = path;
    };

    send();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, pathname]);

  return null;
}
