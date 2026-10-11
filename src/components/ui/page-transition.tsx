/// <reference types="react/canary" />
import { ViewTransition, type ReactNode } from "react";

/**
 * Route change motion for page content. Rendered from a template.tsx, which
 * Next re-mounts on every navigation between its child segments, so the old
 * page leaves (class page-exit) and the new one arrives (class page-enter)
 * through the browser's View Transitions API; the shell around it (sidebar,
 * top bar) is outside the boundary and never moves. default="none" keeps
 * every other transition (Suspense reveals, refreshes, same-page updates)
 * from animating here. Browsers without View Transitions swap instantly and
 * get the CSS fade in app/globals.css instead. Keyframes and timings live in
 * the "Round 4: motion" block of app/globals.css.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  // The App Router ships React canary, which has ViewTransition; a plain
  // React build (unit tests) does not, so fall back to plain children.
  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      {children}
    </ViewTransition>
  );
}
