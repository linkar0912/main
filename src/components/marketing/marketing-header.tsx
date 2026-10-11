"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FacebookGlyph } from "../facebook-glyph";
import { InstagramGlyph } from "../instagram-glyph";
import { ButtonRoll } from "./button-roll";
import { ThemeToggle } from "../theme-toggle";
import { LinkarMark } from "../linkar-mark";
import { marketingHref } from "@/src/lib/site-routing";
import styles from "./marketing-header.module.css";

const navigationItems = [
  { label: "Product", href: "/#product" },
  { label: "Pricing", href: "/pricing" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Resources", href: "/#resources" },
] as const;

const mobileNavigationItems = [
  navigationItems[0],
  navigationItems[1],
  { label: "Instagram", href: "/#channels" },
  { label: "Facebook Pages", href: "/#channels" },
  { label: "Workflows", href: "/#workflows" },
  ...navigationItems.slice(2),
] as const;

const useCaseItems = [
  { label: "Comment automation", detail: "Instagram private replies and Facebook public replies", href: "/#surfaces" },
  { label: "Direct messages", detail: "Instagram conversations triggered by incoming messages", href: "/#surfaces" },
  { label: "Follow-gated campaigns", detail: "Instagram delivery after an official follow check", href: "/#workflows" },
  { label: "Human handoff", detail: "Pause the flow when a person should take over", href: "/#workflows" },
] as const;

const resourceGroups = [
  {
    label: "Learn",
    items: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "Automation workflows", href: "/#workflows" },
      { label: "Frequently asked questions", href: "/#faq" },
      { label: "Help center", href: "/support" },
    ],
  },
  {
    label: "Company",
    items: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
      { label: "Data deletion", href: "/data-deletion" },
      { label: "Support", href: "/support" },
    ],
  },
] as const;

const accountItems = [
  { label: "Sign in", href: "/login", kind: "login" },
  { label: "Get started", href: "/signup", kind: "signup" },
] as const;

type MarketingHeaderProps = {
  /**
   * Absolute origin of the marketing host. Pass it on pages served from another
   * host - the auth screens run on the app host - so the header's marketing
   * links leave that host instead of resolving against it. Omit it on the
   * marketing site itself, where relative links are correct.
   */
  siteOrigin?: string;
  /** When set, pins the header surface (skips the scroll-driven flip). */
  forceSurface?: "solid" | "hero";
};

type DesktopPanel = "solutions" | "resources" | null;

const PANEL_LEAVE_DELAY_MS = 240;
const HOVER_CLICK_GRACE_MS = 400;

/** Floating marketing header with primary and account navigation, and a mobile sheet. */
export function MarketingHeader({ siteOrigin, forceSurface }: MarketingHeaderProps = {}) {
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const solutionsButtonRef = useRef<HTMLButtonElement>(null);
  const resourcesButtonRef = useRef<HTMLButtonElement>(null);
  const menuOpenRef = useRef(false);
  const [scrolled, setScrolled] = useState(forceSurface === "solid");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<DesktopPanel>(null);
  const panelLeaveTimer = useRef<number | null>(null);
  const panelHoverOpenedAt = useRef(0);

  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    if (!menuOpen) {
      return;
    }

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  useEffect(() => {
    if (forceSurface) {
      return;
    }

    let animationFrame = 0;

    const updateHeader = () => {
      animationFrame = 0;
      setScrolled(window.scrollY > 24);
    };

    const onScroll = () => {
      if (animationFrame !== 0) {
        return;
      }

      animationFrame = window.requestAnimationFrame(updateHeader);
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [forceSurface]);

  useEffect(() => {
    if (!activePanel) return;

    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const trigger = activePanel === "solutions" ? solutionsButtonRef.current : resourcesButtonRef.current;
      setActivePanel(null);
      trigger?.focus();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [activePanel]);

  useEffect(() => {
    const closeOnTabletResize = () => {
      if (window.innerWidth < 1_180) {
        setActivePanel(null);
      }

      if (window.innerWidth >= 768 && menuOpenRef.current) {
        menuOpenRef.current = false;
        setMenuOpen(false);
        window.requestAnimationFrame(() => openerRef.current?.focus());
      }
    };

    window.addEventListener("resize", closeOnTabletResize);
    return () => window.removeEventListener("resize", closeOnTabletResize);
  }, []);

  useEffect(() => () => {
    if (panelLeaveTimer.current !== null) window.clearTimeout(panelLeaveTimer.current);
  }, []);

  const cancelPanelLeave = () => {
    if (panelLeaveTimer.current === null) return;
    window.clearTimeout(panelLeaveTimer.current);
    panelLeaveTimer.current = null;
  };

  // A mouse resting on a trigger opens its panel. Touch is left to the click,
  // which would otherwise arrive straight after the synthetic hover and close
  // the panel again.
  const openOnHover = (panel: Exclude<DesktopPanel, null>, pointerType: string) => {
    if (pointerType === "touch") return;
    cancelPanelLeave();
    if (activePanel === panel) return;
    panelHoverOpenedAt.current = Date.now();
    setActivePanel(panel);
  };

  // Click toggles. A click that lands just after the hover opened the panel is
  // the same gesture, so it keeps the panel open rather than shutting it.
  const togglePanel = (panel: Exclude<DesktopPanel, null>) => {
    cancelPanelLeave();
    const justHovered = Date.now() - panelHoverOpenedAt.current < HOVER_CLICK_GRACE_MS;
    setActivePanel((current) => (current === panel && !justHovered ? null : panel));
  };

  // The trigger and its panel form one hover zone. Leaving it closes the panel
  // after a short delay, so the pointer can cross the gap between bar and panel.
  const panelHoverZone = {
    onPointerEnter: cancelPanelLeave,
    onPointerLeave: (event: PointerEvent<HTMLLIElement>) => {
      if (event.pointerType === "touch") return;
      cancelPanelLeave();
      panelLeaveTimer.current = window.setTimeout(() => {
        panelLeaveTimer.current = null;
        setActivePanel(null);
      }, PANEL_LEAVE_DELAY_MS);
    },
  };

  const closeMenu = (restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => openerRef.current?.focus());
    }
  };

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = menuRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled])',
    );
    if (!focusable?.length) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <header
      ref={headerRef}
      className={styles.header}
      data-surface={forceSurface ?? (scrolled ? "solid" : "hero")}
      data-visibility="visible"
      data-menu={menuOpen ? "open" : "closed"}
      data-mega-menu={activePanel ? "open" : "closed"}
      data-solutions={activePanel === "solutions" ? "open" : "closed"}
      data-resources={activePanel === "resources" ? "open" : "closed"}
    >
      <div className={styles.frame}>
        <div className={styles.leftRail}>
          <Link
            className={styles.wordmark}
            href={marketingHref("/#top", siteOrigin)}
            aria-label="Linkar home"
          >
            <LinkarMark className={styles.wordmarkMark} />
            Linkar
          </Link>
        </div>

        <nav className={styles.primaryNavigation} aria-label="Primary">
          <ul>
            <li><Link href={marketingHref(navigationItems[0].href, siteOrigin)}>{navigationItems[0].label}</Link></li>
            <li className={styles.solutionsTrigger} {...panelHoverZone}>
              <button
                ref={solutionsButtonRef}
                className={styles.solutionsButton}
                type="button"
                aria-expanded={activePanel === "solutions"}
                aria-controls="marketing-solutions"
                onClick={() => togglePanel("solutions")}
                onPointerEnter={(event) => openOnHover("solutions", event.pointerType)}
              >
                Solutions <span className={styles.solutionsCaret} aria-hidden="true" />
              </button>
              {/* Rendered right after its trigger so keyboard and screen-reader
                  order runs straight from the button into the panel. */}
              {activePanel === "solutions" ? (
                <nav id="marketing-solutions" className={styles.solutionsPanel} aria-label="Solutions">
                  <section className={styles.solutionsColumn} aria-labelledby="solutions-channel-title">
                    <p id="solutions-channel-title" className={styles.solutionsEyebrow}>By channel</p>
                    <Link className={styles.channelLink} href={marketingHref("/#channels", siteOrigin)} aria-label="Instagram" onClick={() => setActivePanel(null)}>
                      <span className={styles.channelIcon} data-channel="instagram" aria-hidden="true"><InstagramGlyph size={27} brand /></span>
                      <span><strong>Instagram</strong><small>Private replies and DMs</small></span>
                      <span className={styles.linkArrow} aria-hidden="true">&#8599;</span>
                    </Link>
                    <Link className={styles.channelLink} href={marketingHref("/#channels", siteOrigin)} aria-label="Facebook Pages" onClick={() => setActivePanel(null)}>
                      <span className={styles.channelIcon} data-channel="facebook" aria-hidden="true"><FacebookGlyph size={27} brand /></span>
                      <span><strong>Facebook Pages</strong><small>Public comment replies</small></span>
                      <span className={styles.linkArrow} aria-hidden="true">&#8599;</span>
                    </Link>
                  </section>
                  <section className={styles.solutionsColumn} aria-labelledby="solutions-use-case-title">
                    <p id="solutions-use-case-title" className={styles.solutionsEyebrow}>By use case</p>
                    <ul className={styles.useCaseList}>
                      {useCaseItems.map((item, index) => (
                        <li key={item.label} style={{ "--solution-index": index } as CSSProperties}>
                          <Link href={marketingHref(item.href, siteOrigin)} onClick={() => setActivePanel(null)}>
                            <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                            <span className={styles.linkArrow} aria-hidden="true">&#8594;</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                </nav>
              ) : null}
            </li>
            <li><Link href={marketingHref(navigationItems[1].href, siteOrigin)} aria-current={!siteOrigin && pathname === navigationItems[1].href ? "page" : undefined}>{navigationItems[1].label}</Link></li>
            <li><Link href={marketingHref(navigationItems[2].href, siteOrigin)}>{navigationItems[2].label}</Link></li>
            <li className={styles.solutionsTrigger} {...panelHoverZone}>
              <button
                ref={resourcesButtonRef}
                className={styles.solutionsButton}
                type="button"
                aria-expanded={activePanel === "resources"}
                aria-controls="marketing-resources"
                onClick={() => togglePanel("resources")}
                onPointerEnter={(event) => openOnHover("resources", event.pointerType)}
              >
                Resources <span className={styles.solutionsCaret} aria-hidden="true" />
              </button>
              {activePanel === "resources" ? (
                <nav id="marketing-resources" className={`${styles.solutionsPanel} ${styles.resourcesPanel}`} aria-label="Resources">
                  {resourceGroups.map((group, groupIndex) => (
                    <section className={styles.solutionsColumn} aria-labelledby={`resources-${groupIndex}-title`} key={group.label}>
                      <p id={`resources-${groupIndex}-title`} className={styles.solutionsEyebrow}>{group.label}</p>
                      <ul className={`${styles.useCaseList} ${styles.resourceList}`}>
                        {group.items.map((item, index) => (
                          <li key={item.label} style={{ "--solution-index": index } as CSSProperties}>
                            <Link href={marketingHref(item.href, siteOrigin)} onClick={() => setActivePanel(null)}>
                              <strong>{item.label}</strong>
                              <span className={styles.linkArrow} aria-hidden="true">&#8594;</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </nav>
              ) : null}
            </li>
          </ul>
        </nav>

        <div className={styles.rightRail}>
          <nav className={styles.accountNavigation} aria-label="Account">
            <ul>
              <li>
                <Link className={styles.getStarted} href="/signup" prefetch={false}><ButtonRoll label="Get started" /></Link>
              </li>
              <li>
                <Link className={styles.login} href="/login" prefetch={false}>Sign in</Link>
              </li>
            </ul>
          </nav>
          <ThemeToggle className={styles.themeToggle} />
          <div className={styles.mobileActions}>
            <Link className={styles.mobileGetStarted} href="/signup" prefetch={false}><ButtonRoll label="Get started" /></Link>
            <button
            ref={openerRef}
            className={styles.menuButton}
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="marketing-menu"
            onClick={() => setMenuOpen(true)}
            >
              <span aria-hidden="true" className={styles.menuGlyph} />
            </button>

          {menuOpen ? (
            <div
              ref={menuRef}
              id="marketing-menu"
              className={styles.menuSheet}
              role="dialog"
              aria-modal="true"
              aria-label="Menu"
              onKeyDown={trapFocus}
            >
              <button
                ref={closeRef}
                className={styles.closeButton}
                type="button"
                aria-label="Close menu"
                onClick={() => closeMenu(true)}
              >
                <span aria-hidden="true" className={styles.closeGlyph} />
              </button>
              <nav aria-label="Mobile primary">
                <ul>
                  {mobileNavigationItems.map((item) => (
                    <li key={item.label}>
                      <Link
                        href={marketingHref(item.href, siteOrigin)}
                        aria-current={!siteOrigin && item.href === pathname ? "page" : undefined}
                        onClick={() => closeMenu(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  {accountItems.map((item) => (
                    <li key={item.label} data-account={item.kind}>
                      <Link href={marketingHref(item.href, siteOrigin)} prefetch={false} onClick={() => closeMenu(false)}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
            ) : null}
          </div>
        </div>
      </div>

      {activePanel ? (
        <button
          className={styles.solutionsBackdrop}
          type="button"
          aria-label={`Close ${activePanel === "solutions" ? "Solutions" : "Resources"}`}
          data-solutions-backdrop={activePanel === "solutions" ? "" : undefined}
          data-resources-backdrop={activePanel === "resources" ? "" : undefined}
          onClick={() => setActivePanel(null)}
        />
      ) : null}
    </header>
  );
}
