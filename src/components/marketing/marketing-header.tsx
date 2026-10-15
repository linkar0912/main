"use client";

import { useEffect, useRef, useState, type CSSProperties, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";
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
  { label: "Product", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Resources", href: "/#resources" },
] as const;

// The sheet has no Resources panel, so its two most useful entries stand on their own
// instead of one link to the homepage footer.
const mobileNavigationItems = [
  navigationItems[0],
  { label: "Solutions", href: "/solutions" },
  { label: "Workflow recipes", href: "/templates" },
  navigationItems[1],
  { label: "Instagram", href: "/features/instagram-dm-automation" },
  { label: "Facebook Pages", href: "/features/facebook-comment-auto-reply" },
  navigationItems[2],
  { label: "Questions", href: "/#faq" },
  { label: "Help center", href: "/support" },
] as const;

const useCaseItems = [
  { label: "Comment automation", detail: "Instagram private replies from comments", href: "/features/instagram-comment-to-dm" },
  { label: "Keyword replies", detail: "Instagram answers matched to the words people send", href: "/features/instagram-keyword-replies" },
  { label: "Follow-gated campaigns", detail: "Instagram delivery after an official follow check", href: "/features/instagram-follow-gate" },
  { label: "Human handoff", detail: "Pause the flow when a person should take over", href: "/features/instagram-human-handoff" },
  { label: "All features", detail: "Every Instagram and Facebook Page capability", href: "/features" },
] as const;

const audienceItems = [
  { label: "Creators", href: "/solutions/content-creators" },
  { label: "Online coaches", href: "/solutions/online-coaches" },
  { label: "Ecommerce brands", href: "/solutions/ecommerce-brands" },
  { label: "Small businesses", href: "/solutions/small-businesses" },
  { label: "Restaurants and cafes", href: "/solutions/restaurants-cafes" },
  { label: "Solutions by audience", href: "/solutions" },
] as const;

const resourceGroups = [
  {
    label: "Workflow recipes",
    items: [
      { label: "Comment to guide", href: "/templates/comment-guide-delivery" },
      { label: "Price list reply", href: "/templates/dm-price-list" },
      { label: "Booking link reply", href: "/templates/booking-link" },
      { label: "Follow-gated freebie", href: "/templates/follow-gated-freebie" },
      { label: "All workflow recipes", href: "/templates" },
    ],
  },
  {
    label: "Learn",
    items: [
      { label: "How it works", href: "/#how-it-works" },
      { label: "All solutions", href: "/solutions" },
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
      { label: "Contact", href: "/contact" },
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
type HeaderSection = "product" | "solutions" | "pricing" | "resources" | null;

/** Which top-level item the current page belongs to. The SEO collections live under Product, Solutions and Resources. */
function headerSection(pathname: string): HeaderSection {
  const within = (base: string) => pathname === base || pathname.startsWith(`${base}/`);
  if (within("/features")) return "product";
  if (within("/solutions")) return "solutions";
  if (within("/templates")) return "resources";
  if (pathname === "/pricing") return "pricing";
  return null;
}

/** aria-current for a link: "page" on the page itself, "true" on pages inside its section. */
function currentFor(pathname: string, href: string): "page" | "true" | undefined {
  if (href.includes("#")) return undefined;
  if (pathname === href) return "page";
  return href !== "/" && pathname.startsWith(`${href}/`) ? "true" : undefined;
}

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
  // The header on the app host (siteOrigin set) is not on a marketing page, so it marks nothing.
  // usePathname is null outside the app router (tests, isolated renders): treat it as no page.
  const currentPath = pathname ?? "";
  const section = siteOrigin ? null : headerSection(currentPath);

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
  // Keyboard focus moving out of the zone (Tab past the last link) closes it at
  // once. A blur with no new focus (a click on blank panel space, another window)
  // leaves it open; the backdrop and Escape still close it.
  const panelHoverZone = {
    onBlur: (event: FocusEvent<HTMLLIElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !event.currentTarget.contains(next)) setActivePanel(null);
    },
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
            <li><Link href={marketingHref(navigationItems[0].href, siteOrigin)} aria-current={section === "product" ? currentFor(currentPath, navigationItems[0].href) : undefined}>{navigationItems[0].label}</Link></li>
            <li className={styles.solutionsTrigger} {...panelHoverZone}>
              <button
                ref={solutionsButtonRef}
                className={styles.solutionsButton}
                type="button"
                aria-expanded={activePanel === "solutions"}
                aria-controls="marketing-solutions"
                aria-current={section === "solutions" ? "true" : undefined}
                onClick={() => togglePanel("solutions")}
                onPointerEnter={(event) => openOnHover("solutions", event.pointerType)}
              >
                Solutions
              </button>
              {/* Rendered right after its trigger so keyboard and screen-reader
                  order runs straight from the button into the panel. */}
              {activePanel === "solutions" ? (
                <nav id="marketing-solutions" className={styles.solutionsPanel} aria-label="Solutions">
                  <section className={styles.solutionsColumn} aria-labelledby="solutions-channel-title">
                    <p id="solutions-channel-title" className={styles.solutionsEyebrow}>By channel</p>
                    <Link className={styles.channelLink} href={marketingHref("/features/instagram-dm-automation", siteOrigin)} aria-label="Instagram" onClick={() => setActivePanel(null)}>
                      <span className={styles.channelIcon} data-channel="instagram" aria-hidden="true"><InstagramGlyph size={27} brand /></span>
                      <span><strong>Instagram</strong><small>Private replies and DMs</small></span>
                      <span className={styles.linkArrow} aria-hidden="true">&#8599;</span>
                    </Link>
                    <Link className={styles.channelLink} href={marketingHref("/features/facebook-comment-auto-reply", siteOrigin)} aria-label="Facebook Pages" onClick={() => setActivePanel(null)}>
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
                  <section className={styles.solutionsColumn} aria-labelledby="solutions-audience-title">
                    <p id="solutions-audience-title" className={styles.solutionsEyebrow}>By audience</p>
                    <ul className={`${styles.useCaseList} ${styles.resourceList}`}>
                      {audienceItems.map((item, index) => (
                        <li key={item.label} style={{ "--solution-index": index } as CSSProperties}>
                          <Link href={marketingHref(item.href, siteOrigin)} onClick={() => setActivePanel(null)}>
                            <strong>{item.label}</strong>
                            <span className={styles.linkArrow} aria-hidden="true">&#8594;</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                </nav>
              ) : null}
            </li>
            <li><Link href={marketingHref(navigationItems[1].href, siteOrigin)} aria-current={section === "pricing" ? "page" : undefined}>{navigationItems[1].label}</Link></li>
            <li><Link href={marketingHref(navigationItems[2].href, siteOrigin)}>{navigationItems[2].label}</Link></li>
            <li className={styles.solutionsTrigger} {...panelHoverZone}>
              <button
                ref={resourcesButtonRef}
                className={styles.solutionsButton}
                type="button"
                aria-expanded={activePanel === "resources"}
                aria-controls="marketing-resources"
                aria-current={section === "resources" ? "true" : undefined}
                onClick={() => togglePanel("resources")}
                onPointerEnter={(event) => openOnHover("resources", event.pointerType)}
              >
                Resources
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
                        aria-current={siteOrigin ? undefined : currentFor(currentPath, item.href)}
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
