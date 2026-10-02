"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const dialogs: HTMLElement[] = [];
let previousOverflow = "";

// Only the topmost dialog owns keyboard events, including while a command runs.
export function useAdminDialog<T extends HTMLElement>(onClose: () => void, busy = false, active = true) {
  const ref = useRef<T>(null);
  const options = useRef({ onClose, busy });
  useLayoutEffect(() => { options.current = { onClose, busy }; }, [onClose, busy]);

  useEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogs.length) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    dialogs.push(element);
    const focusable = () => Array.from(element.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    (focusable()[0] ?? element).focus();
    const listener = (event: KeyboardEvent) => {
      if (dialogs.at(-1) !== element) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!options.current.busy) options.current.onClose();
      }
      if (event.key !== "Tab") return;
      const targets = focusable();
      const first = targets[0] ?? element;
      const last = targets.at(-1) ?? element;
      if (!element.contains(document.activeElement) || document.activeElement === element
        || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      dialogs.splice(dialogs.indexOf(element), 1);
      if (!dialogs.length) document.body.style.overflow = previousOverflow;
      if (returnFocus?.isConnected) returnFocus.focus();
    };
  }, [active]);
  return ref;
}
