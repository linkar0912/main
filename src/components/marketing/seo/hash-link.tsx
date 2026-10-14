"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

/*
 * In-page links that keep Back working.
 *
 * A plain <a href="#id"> adds a history entry with no state, and Next's router
 * ignores popstate for entries without its own state. After leaving the page
 * from such an entry, Back changed the URL but left the next page on screen.
 * Pushing the hash through history.pushState lets Next copy its state into
 * the new entry (and keep its own URL in sync). The plain href stays as the
 * fallback before hydration and for modified clicks.
 */

const focusable = "a[href], button, input, select, textarea, summary, [tabindex]";

/** Scroll to an in-page target and move focus there, like a native fragment jump. */
export function revealHashTarget(target: HTMLElement): void {
  // html's scroll-behavior picks smooth or instant (reduced motion turns smooth off),
  // and its scroll-padding keeps the target clear of the sticky bars.
  target.scrollIntoView({ block: "start" });
  // The next Tab starts from the target. Sections get a temporary tabindex that goes away on blur.
  if (!target.matches(focusable)) {
    target.setAttribute("tabindex", "-1");
    target.setAttribute("data-hash-target", "");
    target.addEventListener("blur", () => {
      target.removeAttribute("tabindex");
      target.removeAttribute("data-hash-target");
    }, { once: true });
  }
  target.focus({ preventScroll: true });
}

/** Click handler for an <a href="#id"> on the current page. Leaves modified and non-local clicks to the browser. */
export function followHashLink(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = event.currentTarget;
  if (link.target && link.target !== "_self") return;
  const url = new URL(link.href, window.location.href);
  if (!url.hash || url.origin !== window.location.origin || url.pathname !== window.location.pathname || url.search !== window.location.search) return;
  const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (!target) return;
  event.preventDefault();
  // null state: Next fills in its router state and records the new URL.
  if (window.location.hash !== url.hash) window.history.pushState(null, "", url.hash);
  revealHashTarget(target);
}

type HashLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { href: `#${string}` };

/** An in-page anchor for server components: renders a plain <a> and routes the click through followHashLink. */
export function HashLink({ onClick, ...props }: HashLinkProps) {
  return (
    <a
      {...props}
      onClick={(event) => {
        onClick?.(event);
        followHashLink(event);
      }}
    />
  );
}
