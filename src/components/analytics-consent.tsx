"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  readAnalyticsConsent,
  subscribeAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/src/lib/analytics-consent";
import styles from "./analytics-consent.module.css";

const serverSnapshot = (): AnalyticsConsent => null;

/** The visitor's stored analytics choice; null until they make one (and during SSR). */
export function useAnalyticsConsent(): AnalyticsConsent {
  return useSyncExternalStore(subscribeAnalyticsConsent, readAnalyticsConsent, serverSnapshot);
}

/**
 * Asked once, before any analytics cookie exists. Accept and Reject carry the
 * same weight so refusing is as easy as agreeing.
 */
export function AnalyticsConsentBanner() {
  const bannerRef = useRef<HTMLElement>(null);

  // The banner floats over the page. Publish its height so the page can add
  // matching space at the bottom (and other floating controls can sit above
  // it): nothing it covers stays out of reach while the choice is pending.
  useEffect(() => {
    const banner = bannerRef.current;
    const root = document.documentElement;
    if (!banner) return;
    const publish = () => root.style.setProperty("--consent-banner-space", `${Math.ceil(banner.getBoundingClientRect().height) + 16}px`);
    publish();
    root.dataset.consentBanner = "open";
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(banner);
    return () => {
      observer?.disconnect();
      delete root.dataset.consentBanner;
      root.style.removeProperty("--consent-banner-space");
    };
  }, []);

  return (
    <section ref={bannerRef} className={styles.banner} aria-label="Analytics cookies">
      <p>
        We use Google Analytics cookies to see which pages are useful. They stay off unless you accept.{" "}
        <Link href="/cookies">Cookies statement</Link>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => writeAnalyticsConsent("denied")}>
          Reject
        </button>
        <button type="button" className={styles.button} onClick={() => writeAnalyticsConsent("granted")}>
          Accept
        </button>
      </div>
    </section>
  );
}

const consentLabels: Record<"granted" | "denied" | "unset", string> = {
  granted: "You have accepted analytics cookies.",
  denied: "You have rejected analytics cookies.",
  unset: "You have not made a choice yet, so analytics cookies are off.",
};

/** Lets a visitor review and change their choice from the cookies statement. */
export function AnalyticsConsentControls() {
  const consent = useAnalyticsConsent();

  return (
    <div className={styles.controls} role="group" aria-label="Analytics cookie choice">
      <p aria-live="polite">{consentLabels[consent ?? "unset"]}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          aria-pressed={consent === "denied"}
          onClick={() => writeAnalyticsConsent("denied")}
        >
          Reject analytics
        </button>
        <button
          type="button"
          className={styles.button}
          aria-pressed={consent === "granted"}
          onClick={() => writeAnalyticsConsent("granted")}
        >
          Accept analytics
        </button>
      </div>
    </div>
  );
}
