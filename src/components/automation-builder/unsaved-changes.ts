"use client";

import { useEffect } from "react";

export const UNSAVED_CHANGES_MESSAGE = "You have unsaved changes to this automation. Leave without saving?";

function isPlainLeftClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

/**
 * Warns before unsaved builder edits are thrown away: the browser's own prompt
 * on reload/close (beforeunload), and a confirm on in-app link clicks - the
 * "Back to automations" link and the sidebar are next/link anchors that
 * navigate client-side, which beforeunload never sees. The click listener
 * runs in the capture phase on document, ahead of React's root listener, so
 * cancelling it stops next/link before it routes.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Legacy browsers only show the prompt when returnValue is set.
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !isPlainLeftClick(event)) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Same-page hash links don't leave the builder.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (window.confirm(UNSAVED_CHANGES_MESSAGE)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
