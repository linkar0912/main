import { PRODUCT_NAME } from "@/src/lib/branding";
import { LinkarMark } from "./linkar-mark";

/** Shimmering placeholder block. */
export function Skeleton({ style }: { style?: React.CSSProperties }) {
  return (
    <span
      className="skeleton-block"
      style={style}
      aria-hidden
    />
  );
}

/** Route-neutral fallback used above both public auth pages and the workspace. */
export function RootSkeleton() {
  return (
    <main className="root-loading" aria-busy="true" aria-live="polite">
      <span className="brand root-loading-brand">
        <span className="brand-mark" aria-hidden><LinkarMark size={20} /></span>
        <span>{PRODUCT_NAME}</span>
      </span>
      <span className="root-loading-copy">Loading {PRODUCT_NAME}</span>
      <span className="loading-spinner" aria-hidden />
    </main>
  );
}

/**
 * Full-screen loading state shown by route-level `loading.tsx` files while a
 * segment streams in. Mirrors the real layout (sidebar + page skeleton) so the
 * swap-in feels instant instead of jarring.
 */
export function ScreenSkeleton() {
  return (
    <div className="app-frame" aria-busy="true" aria-live="polite">
      <header className="mobile-topbar" aria-label="Loading workspace navigation">
        <Skeleton style={{ height: 32, width: 32, borderRadius: 8 }} />
        <Skeleton style={{ height: 24, width: 104 }} />
      </header>
      <aside className="sidebar sidebar-skeleton" data-open="false">
        <Skeleton style={{ height: 32, width: 150 }} />
        <Skeleton style={{ height: 52, borderRadius: 12 }} />
        <div className="skeleton-stack" style={{ marginTop: 8 }}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} style={{ height: 38, borderRadius: 8 }} />
          ))}
        </div>
      </aside>
      <div className="main-content">
        <div className="page-wrap">
          <div className="page-header-skeleton">
            <div>
              <Skeleton style={{ height: 12, width: 90 }} />
              <Skeleton style={{ height: 34, width: 260, marginTop: 10 }} />
              <Skeleton style={{ height: 13, width: 340, marginTop: 10 }} />
            </div>
          </div>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} style={{ height: 120, borderRadius: 18, marginBottom: 16 }} />
          ))}
        </div>
      </div>
    </div>
  );
}
