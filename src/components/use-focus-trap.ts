"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type FocusTrapOptions = {
  /** Trap only while true; defaults to on (mounted = open). */
  active?: boolean;
  onEscape?: () => void;
  /** Element to focus on open; defaults to the first focusable child, then the container. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Lock page scroll behind the dialog. Defaults to true. */
  lockScroll?: boolean;
};

/**
 * Modal focus handling, the same behaviour as the app-shell drawer: focus
 * moves into the container on open, Tab/Shift+Tab cycle inside it, Escape
 * closes, page scroll is locked, and focus returns to whatever opened it.
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, options: FocusTrapOptions = {}) {
  const { active = true, initialFocusRef, lockScroll = true } = options;
  // Latest callback without re-running the effect (and re-stealing focus)
  // every time the parent re-renders with a new closure.
  const onEscapeRef = useRef(options.onEscape);
  useEffect(() => {
    onEscapeRef.current = options.onEscape;
  });

  useEffect(() => {
    if (!active) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    const container = containerRef.current;
    const focusables = () => Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const initial = initialFocusRef?.current ?? focusables()[0] ?? container;
    initial?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (onEscapeRef.current) {
          event.preventDefault();
          onEscapeRef.current();
        }
        return;
      }
      if (event.key !== "Tab" || !container) return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !container.contains(current);
      if (event.shiftKey && (current === first || current === container || outside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || current === container || outside)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (lockScroll) document.body.style.overflow = previousOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [active, containerRef, initialFocusRef, lockScroll]);
}
