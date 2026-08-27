"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { LinkarMark } from "@/src/components/linkar-mark";
import { ButtonRoll } from "./button-roll";
import styles from "./marketing-header.module.css";

const navigationItems = [
  { label: "Product", href: "/#product" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Resources", href: "/#resources" },
] as const;

const accountItems = [
  { label: "Get started", href: "/signup" },
  { label: "Login", href: "/login" },
] as const;

export function MarketingHeader() {
  const headerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuOpenRef = useRef(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    let animationFrame = 0;
    let lastScrollPosition = window.scrollY;

    const updateHeader = () => {
      animationFrame = 0;
      const scrollPosition = window.scrollY;
      const threshold = window.innerHeight * 0.7;

      if (scrollPosition <= 24) {
        setScrolled(false);
        setHidden(false);
        lastScrollPosition = scrollPosition;
        return;
      }

      setScrolled(scrollPosition > threshold);

      const focusIsInHeader = headerRef.current?.contains(document.activeElement) ?? false;
      if (reduceMotion || menuOpenRef.current || focusIsInHeader) {
        setHidden(false);
        lastScrollPosition = scrollPosition;
        return;
      }

      if (scrollPosition > threshold + 96 && scrollPosition - lastScrollPosition > 8) {
        setHidden(true);
      } else if (lastScrollPosition - scrollPosition > 4) {
        setHidden(false);
      }

      lastScrollPosition = scrollPosition;
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
  }, []);

  useEffect(() => {
    const closeOnTabletResize = () => {
      if (window.innerWidth >= 768) {
        setMenuOpen(false);
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
      data-surface={scrolled ? "solid" : "hero"}
      data-visibility={hidden ? "hidden" : "visible"}
      data-menu={menuOpen ? "open" : "closed"}
    >
      <div className={styles.frame}>
        <Link className={styles.brand} href="/#top" aria-label="Linkar home">
          <LinkarMark size={24} />
          <span className={styles.wordmark}>Linkar</span>
        </Link>

        <nav className={styles.primaryNavigation} aria-label="Primary">
          <ul>
            {navigationItems.map((item) => (
              <li key={item.href} className={styles.sectionLink}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
            <li>
              <Link className={styles.getStarted} href="/signup"><ButtonRoll label="Get started" /></Link>
            </li>
            <li>
              <Link className={styles.login} href="/login">Login</Link>
            </li>
          </ul>
        </nav>

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
                  {[...navigationItems, ...accountItems].map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} onClick={() => closeMenu(false)}>{item.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
