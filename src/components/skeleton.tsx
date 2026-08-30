import { PRODUCT_NAME } from "@/src/lib/branding";

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
      <span className="brand root-loading-logo" aria-label={PRODUCT_NAME}>
        <span className="brand-name">{PRODUCT_NAME}</span>
      </span>
    </main>
  );
}

/**
 * Shared chrome (sidebar + topbar) every in-app loading skeleton renders so
 * the swap-in looks identical to the real layout.
 */
function AppShellSkeletonFrame({ children }: { children: React.ReactNode }) {
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
      <div className="main-content">{children}</div>
    </div>
  );
}

/** Eyebrow + page-title + page-lede triple used at the top of every page skeleton. */
function PageHeaderSkeleton({ titleWidth = 260, ledeWidth = 340 }: { titleWidth?: number; ledeWidth?: number }) {
  return (
    <div className="page-header-skeleton">
      <div>
        <Skeleton style={{ height: 12, width: 90 }} />
        <Skeleton style={{ height: 34, width: titleWidth, marginTop: 10 }} />
        <Skeleton style={{ height: 13, width: ledeWidth, marginTop: 10 }} />
      </div>
    </div>
  );
}

/**
 * Generic fallback used by app route loading files that haven't picked up a
 * page-specific skeleton yet.
 */
export function ScreenSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton />
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} style={{ height: 120, borderRadius: 18, marginBottom: 16 }} />
        ))}
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Dashboard skeleton - mirrors the greeting block, the 3 quickstart cards, and
 * the "Your next best moves" timeline.
 */
export function DashboardSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton titleWidth={300} ledeWidth={420} />
        <div className="quickstart-grid" aria-hidden style={{ marginTop: 18 }}>
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} style={{ height: 96, borderRadius: 14 }} />
          ))}
        </div>
        <div className="skeleton-stack" style={{ marginTop: 24, gap: 14 }}>
          <Skeleton style={{ height: 18, width: 180 }} />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} style={{ height: 64, borderRadius: 12 }} />
          ))}
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Activity skeleton - page header + 6 inbox-style rows (avatar + two-line
 * text + timestamp), matching the activity feed.
 */
export function ActivitySkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton />
        <div className="skeleton-stack" style={{ marginTop: 8, gap: 10 }}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton-row">
              <Skeleton style={{ height: 32, width: 32, borderRadius: 16, flex: "0 0 32px" }} />
              <div className="skeleton-stack" style={{ flex: 1, gap: 6 }}>
                <Skeleton style={{ height: 13, width: "60%" }} />
                <Skeleton style={{ height: 11, width: "40%" }} />
              </div>
              <Skeleton style={{ height: 11, width: 60 }} />
            </div>
          ))}
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Automations skeleton - header + 6 automation-list rows (icon + title +
 * status badge + action button), matching automation-list.tsx.
 */
export function AutomationsSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton titleWidth={220} ledeWidth={300} />
        <div className="skeleton-stack" style={{ marginTop: 12, gap: 0 }}>
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="skeleton-row skeleton-row-bordered">
              <Skeleton style={{ height: 38, width: 38, borderRadius: 10, flex: "0 0 38px" }} />
              <div className="skeleton-stack" style={{ flex: 1, gap: 6 }}>
                <Skeleton style={{ height: 13, width: "55%" }} />
                <Skeleton style={{ height: 11, width: "35%" }} />
              </div>
              <Skeleton style={{ height: 22, width: 78, borderRadius: 99 }} />
              <Skeleton style={{ height: 28, width: 80, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Sequences skeleton - same row shape as automations but with 4 rows.
 */
export function SequencesSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton titleWidth={200} ledeWidth={320} />
        <div className="skeleton-stack" style={{ marginTop: 12, gap: 0 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="skeleton-row skeleton-row-bordered">
              <Skeleton style={{ height: 38, width: 38, borderRadius: 10, flex: "0 0 38px" }} />
              <div className="skeleton-stack" style={{ flex: 1, gap: 6 }}>
                <Skeleton style={{ height: 13, width: "55%" }} />
                <Skeleton style={{ height: 11, width: "45%" }} />
              </div>
              <Skeleton style={{ height: 22, width: 88, borderRadius: 99 }} />
              <Skeleton style={{ height: 28, width: 80, borderRadius: 8 }} />
            </div>
          ))}
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Broadcasts skeleton - header + compose form card + 3 broadcast rows.
 */
export function BroadcastsSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton titleWidth={210} ledeWidth={340} />
        <Skeleton style={{ height: 220, borderRadius: 14, marginTop: 14, marginBottom: 20 }} />
        <div className="skeleton-stack" style={{ gap: 0 }}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="skeleton-row skeleton-row-bordered">
              <Skeleton style={{ height: 38, width: 38, borderRadius: 10, flex: "0 0 38px" }} />
              <div className="skeleton-stack" style={{ flex: 1, gap: 6 }}>
                <Skeleton style={{ height: 13, width: "55%" }} />
                <Skeleton style={{ height: 11, width: "40%" }} />
              </div>
              <Skeleton style={{ height: 22, width: 88, borderRadius: 99 }} />
            </div>
          ))}
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Settings skeleton - header + 4 stacked settings cards.
 */
export function SettingsSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton titleWidth={180} ledeWidth={300} />
        <div className="skeleton-stack" style={{ marginTop: 8, gap: 24 }}>
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} style={{ height: 140, borderRadius: 14 }} />
          ))}
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Profile skeleton - 2-column grid matching the profile-screen layout (large
 * profile card on the left, stacked connection / quick-access cards on the
 * right).
 */
export function ProfileSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton titleWidth={160} ledeWidth={300} />
        <div className="profile-layout" aria-hidden style={{ marginTop: 12 }}>
          <Skeleton style={{ height: 320, borderRadius: 14 }} />
          <div className="skeleton-stack" style={{ gap: 14 }}>
            <Skeleton style={{ height: 140, borderRadius: 14 }} />
            <Skeleton style={{ height: 110, borderRadius: 14 }} />
          </div>
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}

/**
 * Help skeleton - hero block (matches the .help-hero panel: heading + lede +
 * search bar) followed by FAQ cards arranged in topic groups.
 */
export function HelpSkeleton() {
  return (
    <AppShellSkeletonFrame>
      <div className="page-wrap">
        <PageHeaderSkeleton titleWidth={140} ledeWidth={340} />
        <div className="help-hero" aria-hidden style={{ marginBottom: 24 }}>
          <Skeleton style={{ height: 12, width: 90, marginBottom: 8 }} />
          <Skeleton style={{ height: 32, width: 240, marginBottom: 8 }} />
          <Skeleton style={{ height: 14, width: 460, marginBottom: 16 }} />
          <Skeleton style={{ height: 44, borderRadius: 8, width: "100%", maxWidth: 560 }} />
        </div>
        <div className="help-topic-groups">
          <div className="help-topic-group">
            <Skeleton style={{ height: 10, width: 120, marginBottom: 4 }} />
            <div className="faq-list">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} style={{ height: 56, borderRadius: 12 }} />
              ))}
            </div>
          </div>
          <div className="help-topic-group">
            <Skeleton style={{ height: 10, width: 120, marginBottom: 4 }} />
            <div className="faq-list">
              {Array.from({ length: 2 }, (_, index) => (
                <Skeleton key={index} style={{ height: 56, borderRadius: 12 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShellSkeletonFrame>
  );
}
