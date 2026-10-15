"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FocusEvent, type RefObject } from "react";
import { followHashLink } from "./hash-link";
import styles from "./seo-page-nav.module.css";
import pageStyles from "./seo-page.module.css";

export type SeoPageNavItem = { id: string; label: string };

/** Where the spy line sits: a third of the way down, never above the sticky bars. */
function spyLine() {
  return spyLineFor(window.innerHeight);
}

/**
 * The spy line for a viewport height, and the observer margins that make a 1px
 * band at it. A hidden or collapsed view reports a height of 0; the margins
 * must still be valid lengths, or IntersectionObserver throws and the page
 * falls over.
 */
export function spyLineFor(height: number) {
  return Math.max(0, Math.round(Math.min(Math.max(height * .32, 200), height - 1)));
}

export function spyBandMargin(height: number) {
  const line = spyLineFor(height);
  return `-${line}px 0px -${Math.max(0, Math.round(height) - line - 1)}px 0px`;
}

/**
 * The id of the section under the spy line. A thin IntersectionObserver band at
 * the line notices when a section edge crosses it, and a check after scrolling
 * stops confirms it. Above the first section and past the end of the last one,
 * nothing is current.
 */
function useScrollSpy(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join(" ");

  useEffect(() => {
    const targets = key.split(" ").map((id) => document.getElementById(id)).filter((target): target is HTMLElement => target !== null);
    if (targets.length === 0 || typeof IntersectionObserver === "undefined") return;
    let observer: IntersectionObserver | null = null;

    const update = () => {
      const line = spyLine();
      let current: HTMLElement | null = null;
      for (const target of targets) if (target.getBoundingClientRect().top <= line) current = target;
      if (current && current === targets[targets.length - 1] && current.getBoundingClientRect().bottom < line) current = null;
      setActive(current ? current.id : null);
    };

    // A 1px band at the spy line: a section enters or leaves it exactly when its edge crosses the line.
    const observe = () => {
      observer?.disconnect();
      observer = new IntersectionObserver(update, { rootMargin: spyBandMargin(window.innerHeight) });
      targets.forEach((target) => observer?.observe(target));
      update();
    };

    // The band can miss a crossing during a long smooth scroll; settle on the true
    // section once scrolling stops.
    let settle = 0;
    const onScroll = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(update, 120);
    };

    observe();
    window.addEventListener("resize", observe);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.clearTimeout(settle);
      window.removeEventListener("resize", observe);
      window.removeEventListener("scroll", onScroll);
    };
  }, [key]);

  return active;
}

/** On phones the row scrolls sideways: keep the current link in view, centred. */
function useKeepInView(listRef: RefObject<HTMLUListElement | null>, active: string | null) {
  useEffect(() => {
    const list = listRef.current;
    if (!active || !list || list.scrollWidth <= list.clientWidth || typeof list.scrollTo !== "function") return;
    const link = list.querySelector<HTMLElement>(`[data-target="${active}"]`);
    if (!link) return;
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Measured from the boxes, not offsetLeft: the link's offset parent is not always the list.
    const offset = link.getBoundingClientRect().left - list.getBoundingClientRect().left + list.scrollLeft;
    list.scrollTo({ left: offset - (list.clientWidth - link.offsetWidth) / 2, behavior: reduce ? "auto" : "smooth" });
  }, [listRef, active]);
}

/**
 * Keyboard focus on a pill that is only partly visible: scroll the row (never
 * the page) so the pill and its ring clear the edge fade. Chrome only scrolls
 * the row for a completely hidden pill. A row with a longer end fade publishes
 * its length as --page-nav-fade-end.
 */
function revealInRow(event: FocusEvent<HTMLUListElement>) {
  const list = event.currentTarget;
  const link = event.target;
  if (!(link instanceof HTMLElement) || list.scrollWidth <= list.clientWidth || typeof list.scrollBy !== "function") return;
  const pill = link.getBoundingClientRect();
  const row = list.getBoundingClientRect();
  const pad = 24;
  const endPad = Math.max(pad, Number.parseFloat(getComputedStyle(list).getPropertyValue("--page-nav-fade-end")) || 0);
  if (pill.left < row.left + pad) list.scrollBy({ left: pill.left - row.left - pad, behavior: "instant" });
  else if (pill.right > row.right - endPad) list.scrollBy({ left: pill.right - row.right + endPad, behavior: "instant" });
}

/**
 * Sets data-stuck on whichever candidate is the sticky strip at this width
 * while it rests under the floating header. CSS then paints solid canvas
 * behind the header, so content never shows through around the glass.
 */
function useStuck(first: RefObject<HTMLElement | null>, second?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    let strip: HTMLElement | null = null;
    let stickyTop = 0;
    let frame = 0;

    const measure = () => {
      frame = 0;
      strip?.toggleAttribute("data-stuck", strip.getBoundingClientRect().top <= stickyTop + .5);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    // The hub dock sticks as a whole on laptops; on smaller screens only its topic row does.
    const pick = () => {
      const next = [first.current, second?.current].find((element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        return style.position === "sticky" && style.display !== "contents";
      }) ?? null;
      if (strip && strip !== next) strip.removeAttribute("data-stuck");
      strip = next;
      stickyTop = strip ? Number.parseFloat(getComputedStyle(strip).top) || 0 : 0;
      measure();
    };

    pick();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", pick);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      strip?.removeAttribute("data-stuck");
    };
  }, [first, second]);
}

/**
 * The on-page nav. Plain anchors, so it works before (and without) hydration;
 * once hydrated, the scrollspy marks the section being read with
 * aria-current="location" and clicks go through followHashLink.
 */
export function SeoPageNav({ items, recipeHref }: { items: readonly SeoPageNavItem[]; recipeHref?: string | null }) {
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const active = useScrollSpy(items.map((item) => item.id));
  useKeepInView(listRef, active);
  useStuck(navRef);

  return (
    <nav className={styles.nav} aria-label="On this page" data-page-nav="" ref={navRef}>
      <div className={styles.inner}>
        <span className={styles.label} aria-hidden="true">On this page</span>
        <ul className={styles.list} ref={listRef} onFocus={revealInRow}>
          {items.map((item) => (
            <li key={item.id}>
              <a className={styles.link} href={`#${item.id}`} data-target={item.id} aria-current={active === item.id ? "location" : undefined} onClick={followHashLink}>{item.label}</a>
            </li>
          ))}
        </ul>
        {/* Outside the scrolling row, so it is always on screen; below 1024px it shows only its icon. */}
        {recipeHref ? (
          <a className={`${styles.link} ${styles.download}`} href={recipeHref} download>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />
            </svg>
            <span className={styles.downloadLabel}>Download recipe</span>
          </a>
        ) : null}
      </div>
    </nav>
  );
}

export type SeoHubTab = { href: string; label: string; short: string; current: boolean };
export type SeoHubTopic = { id: string; label: string; accent: string };

/*
 * The hub filter. Laptops: one sticky strip with the collection tabs and the
 * topic anchors. Tablets and phones: the tabs become a pill switch that
 * scrolls away, and only the topic row sticks (the dock is display: contents
 * there). The topic row has the same scrollspy as the on-page nav.
 */
export function SeoHubFilter({ tabs, topics }: { tabs: readonly SeoHubTab[]; topics: readonly SeoHubTopic[] }) {
  const dockRef = useRef<HTMLDivElement>(null);
  const topicsRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const active = useScrollSpy(topics.map((topic) => topic.id));
  useKeepInView(listRef, active);
  useStuck(dockRef, topicsRef);

  return (
    <div className={pageStyles.filterDock} ref={dockRef}>
      <div className={pageStyles.filterInner}>
        <nav className={pageStyles.tabs} aria-label="Explore Linkar">
          {tabs.map((tab) => (
            <Link key={tab.href} className={pageStyles.tab} href={tab.href} aria-current={tab.current ? "page" : undefined}>
              <span className={pageStyles.tabFull}>{tab.label}</span>
              <span className={pageStyles.tabShort}>{tab.short}</span>
            </Link>
          ))}
        </nav>
        <span className={pageStyles.filterDivider} aria-hidden="true" />
        <nav className={pageStyles.topics} aria-label="Browse by topic" ref={topicsRef}>
          <ul className={pageStyles.topicList} ref={listRef} onFocus={revealInRow}>
            {topics.map((topic) => (
              <li key={topic.id}>
                <a className={pageStyles.topic} href={`#${topic.id}`} data-target={topic.id} aria-current={active === topic.id ? "location" : undefined} onClick={followHashLink}>
                  <span className={pageStyles.topicDot} style={{ background: topic.accent }} aria-hidden="true" />
                  {topic.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
