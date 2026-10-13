"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import {
  readAnalyticsConsent,
  subscribeAnalyticsConsent,
  timeZoneRequiresConsent,
  visitorTimeZone,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/src/lib/analytics-consent";
import styles from "./analytics-consent.module.css";

const serverSnapshot = (): AnalyticsConsent => null;

/** The visitor's stored analytics choice; null until they make one (and during SSR). */
export function useAnalyticsConsent(): AnalyticsConsent {
  return useSyncExternalStore(subscribeAnalyticsConsent, readAnalyticsConsent, serverSnapshot);
}

const noopSubscribe = () => () => {};
const readConsentRequired = () => timeZoneRequiresConsent(visitorTimeZone());

/**
 * Whether this visitor is asked before analytics cookies are set (see
 * timeZoneRequiresConsent). True during server rendering, the cautious answer.
 */
export function useConsentRequired(): boolean {
  return useSyncExternalStore(noopSubscribe, readConsentRequired, () => true);
}

/**
 * Asked once, before any analytics cookie exists, of visitors who must opt in.
 * Accept and Decline carry the same weight so refusing is as easy as agreeing.
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
        We&#8217;d like to use Google Analytics cookies to see which pages are useful. They stay off unless you accept.{" "}
        <Link href="/cookies">Cookies statement</Link>
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={() => writeAnalyticsConsent("denied")}>
          Decline
        </button>
        <button type="button" className={styles.button} onClick={() => writeAnalyticsConsent("granted")}>
          Accept
        </button>
      </div>
    </section>
  );
}

const consentLabels: Record<"granted" | "denied" | "unsetAsked" | "unsetDefault", string> = {
  granted: "You have accepted analytics cookies.",
  denied: "You have declined analytics cookies.",
  unsetAsked: "You have not made a choice yet, so analytics cookies are off.",
  unsetDefault: "You have not made a choice, so analytics cookies are on. You can decline them here.",
};

/** Lets a visitor review and change their choice from the cookies statement. */
export function AnalyticsConsentControls() {
  const consent = useAnalyticsConsent();
  const askFirst = useConsentRequired();

  return (
    <div className={styles.controls} role="group" aria-label="Analytics cookie choice">
      <p aria-live="polite">{consentLabels[consent ?? (askFirst ? "unsetAsked" : "unsetDefault")]}</p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          aria-pressed={consent === "denied"}
          onClick={() => writeAnalyticsConsent("denied")}
        >
          Decline analytics
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
