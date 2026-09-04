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
    if (!enabled || typeof window.gtag !== "function") return;

    const path = redactAnalyticsPath(pathname ?? "/");
    if (previous.current === path) return;

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
  }, [enabled, pathname]);

  return null;
}
