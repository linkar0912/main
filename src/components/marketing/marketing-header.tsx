"use client";

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Link from "next/link";
import { FacebookGlyph } from "../facebook-glyph";
import { InstagramGlyph } from "../instagram-glyph";
import { ButtonRoll } from "./button-roll";
import { ThemeToggle } from "../theme-toggle";
import styles from "./marketing-header.module.css";

const navigationItems = [
  { label: "Product", href: "/#product" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Resources", href: "/#resources" },
] as const;

const mobileNavigationItems = [
  navigationItems[0],
  { label: "Instagram", href: "/#channels" },
  { label: "Facebook Pages", href: "/#channels" },
  { label: "Workflows", href: "/#workflows" },
  ...navigationItems.slice(1),
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
  { label: "Get started", href: "/signup" },
  { label: "Sign in", href: "/login" },
] as const;

type MarketingHeaderProps = {
  /** When set, pins the header surface (skips the scroll-driven flip). */
  forceSurface?: "solid" | "hero";
};

type DesktopPanel = "solutions" | "resources" | null;

/** Floating marketing header with primary and account navigation, and a mobile sheet. */
export function MarketingHeader({ forceSurface }: MarketingHeaderProps = {}) {
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
            href="/#top"
            aria-label="Linkar home"
          >
            Linkar
          </Link>
          <div className={styles.language} aria-label="Language: English">
            <span>EN</span>
            <span className={styles.languageCaret} aria-hidden="true" />
          </div>
        </div>

        <nav className={styles.primaryNavigation} aria-label="Primary">
          <ul>
            <li><Link href={navigationItems[0].href}>{navigationItems[0].label}</Link></li>
            <li className={styles.solutionsTrigger}>
              <button
                ref={solutionsButtonRef}
                className={styles.solutionsButton}
                type="button"
                aria-expanded={activePanel === "solutions"}
                aria-controls="marketing-solutions"
                onClick={() => setActivePanel("solutions")}
                onPointerEnter={() => setActivePanel("solutions")}
              >
                Solutions <span className={styles.solutionsCaret} aria-hidden="true" />
              </button>
            </li>
            <li><Link href={navigationItems[1].href}>{navigationItems[1].label}</Link></li>
            <li className={styles.solutionsTrigger}>
              <button
                ref={resourcesButtonRef}
                className={styles.solutionsButton}
                type="button"
                aria-expanded={activePanel === "resources"}
                aria-controls="marketing-resources"
                onClick={() => setActivePanel("resources")}
                onPointerEnter={() => setActivePanel("resources")}
              >
                Resources <span className={styles.solutionsCaret} aria-hidden="true" />
              </button>
            </li>
          </ul>
        </nav>

        <div className={styles.rightRail}>
          <nav className={styles.accountNavigation} aria-label="Account">
            <ul>
              <li>
                <Link className={styles.getStarted} href="/signup"><ButtonRoll label="Get started" /></Link>
              </li>
              <li>
                <Link className={styles.login} href="/login">Sign in</Link>
              </li>
            </ul>
          </nav>
          <ThemeToggle className={styles.themeToggle} />
          <div className={styles.mobileActions}>
            <Link className={styles.mobileGetStarted} href="/signup"><ButtonRoll label="Get started" /></Link>
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
                  {[...mobileNavigationItems, ...accountItems].map((item) => (
                    <li key={item.label}>
                      <Link href={item.href} onClick={() => closeMenu(false)}>{item.label}</Link>
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
        <>
          <button
            className={styles.solutionsBackdrop}
            type="button"
            aria-label={`Close ${activePanel === "solutions" ? "Solutions" : "Resources"}`}
            data-solutions-backdrop={activePanel === "solutions" ? "" : undefined}
            data-resources-backdrop={activePanel === "resources" ? "" : undefined}
            onClick={() => setActivePanel(null)}
          />
          {activePanel === "solutions" ? (
            <nav id="marketing-solutions" className={styles.solutionsPanel} aria-label="Solutions">
              <section className={styles.solutionsColumn} aria-labelledby="solutions-channel-title">
                <p id="solutions-channel-title" className={styles.solutionsEyebrow}>By channel</p>
                <Link className={styles.channelLink} href="/#channels" aria-label="Instagram" onClick={() => setActivePanel(null)}>
                  <span className={styles.channelIcon} data-channel="instagram" aria-hidden="true"><InstagramGlyph size={27} brand /></span>
                  <span><strong>Instagram</strong><small>Private replies and DMs</small></span>
                  <span className={styles.linkArrow} aria-hidden="true">&#8599;</span>
                </Link>
                <Link className={styles.channelLink} href="/#channels" aria-label="Facebook Pages" onClick={() => setActivePanel(null)}>
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
                      <Link href={item.href} onClick={() => setActivePanel(null)}>
                        <span><strong>{item.label}</strong><small>{item.detail}</small></span>
                        <span className={styles.linkArrow} aria-hidden="true">&#8594;</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </nav>
          ) : (
            <nav id="marketing-resources" className={`${styles.solutionsPanel} ${styles.resourcesPanel}`} aria-label="Resources">
              {resourceGroups.map((group, groupIndex) => (
                <section className={styles.solutionsColumn} aria-labelledby={`resources-${groupIndex}-title`} key={group.label}>
                  <p id={`resources-${groupIndex}-title`} className={styles.solutionsEyebrow}>{group.label}</p>
                  <ul className={`${styles.useCaseList} ${styles.resourceList}`}>
                    {group.items.map((item, index) => (
                      <li key={item.label} style={{ "--solution-index": index } as CSSProperties}>
                        <Link href={item.href} onClick={() => setActivePanel(null)}>
                          <strong>{item.label}</strong>
                          <span className={styles.linkArrow} aria-hidden="true">&#8594;</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>
          )}
        </>
      ) : null}
    </header>
  );
}
