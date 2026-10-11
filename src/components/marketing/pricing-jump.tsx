"use client";

import { useEffect, useState } from "react";

import styles from "./pricing-page.module.css";

type FinderPosition = "below" | "on" | "above";

/**
 * Floating shortcut to the plan finder. It waits until the visitor has
 * scrolled past the opening plan cards (so it never sits on their first call
 * to action), points toward the finder, hides while the finder is on screen,
 * and steps aside once the closing call to action and footer arrive so their
 * buttons stay clear. Phones get no shortcut: there the finder sits directly
 * under the single column of plans, and a floating pill would cover each
 * plan's full-width button in turn (see pricing-page.module.css).
 */
export function PricingJump({ targetId }: { targetId: string }) {
  const [finder, setFinder] = useState<FinderPosition>("below");
  const [scrolled, setScrolled] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setFinder("on");
        else setFinder(entry.boundingClientRect.top > 0 ? "below" : "above");
      },
      { rootMargin: "-20% 0px -20% 0px" },
    );
    observer.observe(target);

    // The closing call to action and the footer have their own buttons and
    // links; the shortcut steps aside while either is on screen.
    const stops = Array.from(document.querySelectorAll("footer, [data-jump-stop]"));
    const inView = new Set<Element>();
    const footerObserver = stops.length
      ? new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target);
          else inView.delete(entry.target);
        }
        setAtEnd(inView.size > 0);
      })
      : null;
    for (const stop of stops) footerObserver?.observe(stop);

    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setScrolled(window.scrollY > window.innerHeight * 0.6);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      footerObserver?.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [targetId]);

  const visible = finder !== "on" && scrolled && !atEnd;

  return (
    <a
      className={styles.jump}
      href={`#${targetId}`}
      data-visible={visible || undefined}
      data-direction={finder === "above" ? "up" : "down"}
      aria-hidden={visible ? undefined : true}
      tabIndex={visible ? undefined : -1}
    >
      Pick your plan in 30 seconds
      <span aria-hidden="true">{finder === "above" ? "↑" : "↓"}</span>
    </a>
  );
}
