import { PRODUCT_NAME } from "@/src/lib/branding";

type SkeletonProps = { className?: string; style?: React.CSSProperties };

/** One decorative loading shape. Structure and spacing belong to its parent composition. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <span className={`skeleton-block ${className}`.trim()} style={style} aria-hidden />;
}

export function RootSkeleton() {
  return <main className="root-loading" aria-busy="true" aria-live="polite"><span className="brand root-loading-logo" aria-label={PRODUCT_NAME}><span className="brand-name">{PRODUCT_NAME}</span></span></main>;
}

function AppShellSkeletonFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-frame skeleton-shell" aria-busy="true" aria-live="polite">
      <header className="mobile-topbar" aria-label="Loading workspace navigation"><Skeleton className="skeleton-square skeleton-square-sm" /><Skeleton className="skeleton-word skeleton-word-brand" /></header>
      <aside className="sidebar sidebar-skeleton" data-open="false">
        <Skeleton className="skeleton-word skeleton-word-brand" />
        <Skeleton className="skeleton-account" />
        <div className="skeleton-nav" aria-hidden>{Array.from({ length: 7 }, (_, index) => <Skeleton className="skeleton-nav-item" key={index} />)}</div>
      </aside>
      <div className="main-content">{children}</div>
    </div>
  );
}

function LoadingRegion({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={`skeleton-region ${className}`.trim()} aria-label={label} aria-busy="true" aria-live="polite">{children}</div>;
}

function PageHeaderSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div className="page-header-skeleton" aria-hidden>
      <div className="skeleton-stack"><Skeleton className="skeleton-word skeleton-word-eyebrow" /><Skeleton className={`skeleton-word ${compact ? "skeleton-title-sm" : "skeleton-title"}`} /><Skeleton className="skeleton-word skeleton-lede" /></div>
      <Skeleton className="skeleton-button" />
    </div>
  );
}

function WorkspaceScreen({ label, children, compactHeader = false }: { label: string; children: React.ReactNode; compactHeader?: boolean }) {
  return <AppShellSkeletonFrame><main className="page-wrap skeleton-page" aria-label={label} aria-busy="true"><PageHeaderSkeleton compact={compactHeader} />{children}</main></AppShellSkeletonFrame>;
}

function SkeletonListRows({ count = 5, compact = false }: { count?: number; compact?: boolean }) {
  return (
    <div className="skeleton-list" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div className={`skeleton-list-row ${compact ? "is-compact" : ""}`} key={index}>
          <Skeleton className="skeleton-avatar" />
          <div className="skeleton-stack skeleton-row-copy"><Skeleton className="skeleton-word skeleton-row-title" /><Skeleton className="skeleton-word skeleton-row-meta" /></div>
          <Skeleton className="skeleton-chip" />
        </div>
      ))}
    </div>
  );
}

function SkeletonToolbar({ filters = 4 }: { filters?: number }) {
  return <div className="skeleton-toolbar" aria-hidden><Skeleton className="skeleton-search" /><div className="skeleton-chip-row">{Array.from({ length: filters }, (_, index) => <Skeleton className="skeleton-chip" key={index} />)}</div></div>;
}

function SkeletonMetrics({ count = 4 }: { count?: number }) {
  return (
    <div className="skeleton-metrics" aria-hidden>
      {Array.from({ length: count }, (_, index) => <div className="skeleton-metric" key={index}><Skeleton className="skeleton-avatar" /><div className="skeleton-stack"><Skeleton className="skeleton-word skeleton-row-meta" /><Skeleton className="skeleton-word skeleton-number" /><Skeleton className="skeleton-word skeleton-note" /></div></div>)}
    </div>
  );
}

export function InlineContentSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <LoadingRegion label={label} className="skeleton-content skeleton-inline"><SkeletonListRows count={rows} compact /></LoadingRegion>;
}

export function ActivityContentSkeleton() {
  return (
    <LoadingRegion label="Loading inbox activity" className="skeleton-content skeleton-inbox-content">
      <div className="skeleton-summary-line" aria-hidden><Skeleton className="skeleton-number" /><Skeleton className="skeleton-word skeleton-note" /></div>
      <div className="skeleton-filter-line"><Skeleton className="skeleton-filter-label" /><div className="skeleton-chip-row"><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /></div></div>
      <div className="skeleton-filter-line"><Skeleton className="skeleton-filter-label" /><div className="skeleton-chip-row"><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /></div></div>
      <SkeletonListRows count={5} compact />
    </LoadingRegion>
  );
}

export function ContactsContentSkeleton({ withToolbar = true }: { withToolbar?: boolean } = {}) {
  return <LoadingRegion label="Loading contacts" className="skeleton-content">{withToolbar ? <SkeletonToolbar filters={5} /> : null}<SkeletonListRows count={5} /></LoadingRegion>;
}

export function InsightsContentSkeleton() {
  return (
    <LoadingRegion label="Loading insights data" className="skeleton-content skeleton-insights-content">
      <SkeletonMetrics />
      <section className="skeleton-chart" aria-hidden><div className="skeleton-chart-heading"><div className="skeleton-stack"><Skeleton className="skeleton-word skeleton-word-eyebrow" /><Skeleton className="skeleton-word skeleton-section-title" /></div><Skeleton className="skeleton-word skeleton-legend" /></div><div className="skeleton-chart-bars">{Array.from({ length: 14 }, (_, index) => <Skeleton className={`skeleton-chart-bar h-${(index % 5) + 1}`} key={index} />)}</div></section>
      <div className="skeleton-detail-grid" aria-hidden><section className="skeleton-detail-panel"><Skeleton className="skeleton-word skeleton-section-title" /><SkeletonListRows count={4} compact /></section><section className="skeleton-detail-panel"><Skeleton className="skeleton-word skeleton-section-title" /><SkeletonListRows count={3} compact /></section></div>
    </LoadingRegion>
  );
}

export function AutomationListContentSkeleton({ count = 5, withToolbar = false }: { count?: number; withToolbar?: boolean }) {
  return <LoadingRegion label="Loading automations" className="skeleton-content">{withToolbar ? <SkeletonToolbar filters={3} /> : null}<SkeletonListRows count={count} /></LoadingRegion>;
}

export function ScreenSkeleton() { return <WorkspaceScreen label="Loading workspace"><SkeletonListRows count={4} /></WorkspaceScreen>; }

export function DashboardSkeleton() {
  return <WorkspaceScreen label="Loading Home"><div className="skeleton-card-grid" aria-hidden>{Array.from({ length: 3 }, (_, index) => <div className="skeleton-action-card" key={index}><Skeleton className="skeleton-avatar" /><Skeleton className="skeleton-word skeleton-row-title" /><Skeleton className="skeleton-word skeleton-row-meta" /></div>)}</div><SkeletonListRows count={4} compact /></WorkspaceScreen>;
}

export function ActivitySkeleton() { return <WorkspaceScreen label="Loading Inbox"><ActivityContentSkeleton /></WorkspaceScreen>; }
export function AutomationsSkeleton() { return <WorkspaceScreen label="Loading Automations"><AutomationListContentSkeleton count={5} withToolbar /></WorkspaceScreen>; }
export function SequencesSkeleton() { return <WorkspaceScreen label="Loading Sequences"><AutomationListContentSkeleton count={4} withToolbar /></WorkspaceScreen>; }

export function BroadcastsSkeleton() {
  return <WorkspaceScreen label="Loading Broadcasts"><div className="skeleton-form" aria-hidden><Skeleton className="skeleton-word skeleton-section-title" /><Skeleton className="skeleton-input" /><Skeleton className="skeleton-input is-tall" /></div><SkeletonListRows count={3} /></WorkspaceScreen>;
}

export function QuickAutomationSkeleton() {
  return <WorkspaceScreen label="Loading Quick Automation"><SkeletonToolbar filters={3} /><div className="skeleton-reel-grid" aria-hidden>{Array.from({ length: 4 }, (_, index) => <div className="skeleton-reel" key={index}><Skeleton className="skeleton-reel-media" /><Skeleton className="skeleton-word skeleton-row-title" /><Skeleton className="skeleton-word skeleton-row-meta" /></div>)}</div></WorkspaceScreen>;
}

export function InsightsSkeleton() { return <WorkspaceScreen label="Loading Insights"><InsightsContentSkeleton /></WorkspaceScreen>; }

export function SettingsSkeleton() {
  return <WorkspaceScreen label="Loading Settings"><SkeletonMetrics count={3} /><div className="skeleton-settings-grid" aria-hidden>{Array.from({ length: 2 }, (_, index) => <section className="skeleton-detail-panel" key={index}><Skeleton className="skeleton-word skeleton-section-title" /><SkeletonListRows count={2} compact /></section>)}</div></WorkspaceScreen>;
}

export function ContactsSkeleton() { return <WorkspaceScreen label="Loading Contacts"><ContactsContentSkeleton /></WorkspaceScreen>; }

export function ProfileSkeleton() {
  return <WorkspaceScreen label="Loading Profile"><div className="skeleton-detail-grid"><section className="skeleton-detail-panel skeleton-profile-card"><Skeleton className="skeleton-avatar skeleton-avatar-lg" /><SkeletonListRows count={3} compact /></section><section className="skeleton-detail-panel"><SkeletonListRows count={3} compact /></section></div></WorkspaceScreen>;
}

export function HelpSkeleton() {
  return <WorkspaceScreen label="Loading Help" compactHeader><SkeletonToolbar filters={0} /><div className="skeleton-detail-grid"><section className="skeleton-detail-panel"><SkeletonListRows count={4} compact /></section><section className="skeleton-detail-panel"><SkeletonListRows count={3} compact /></section></div></WorkspaceScreen>;
}

function AdminPageSkeleton({ label, children }: { label: string; children: React.ReactNode }) {
  return <main className="page-wrap skeleton-page admin-skeleton-page" aria-label={label} aria-busy="true"><PageHeaderSkeleton />{children}</main>;
}

export function AdminOverviewSkeleton() {
  return <AdminPageSkeleton label="Loading admin overview"><SkeletonMetrics /><div className="skeleton-detail-grid"><section className="skeleton-detail-panel"><SkeletonListRows count={4} compact /></section><section className="skeleton-detail-panel"><SkeletonListRows count={6} compact /></section></div></AdminPageSkeleton>;
}

export function AdminTableSkeleton() { return <AdminPageSkeleton label="Loading admin table"><SkeletonToolbar filters={4} /><SkeletonListRows count={7} /></AdminPageSkeleton>; }

export function AdminDetailSkeleton() {
  return <AdminPageSkeleton label="Loading admin details"><div className="skeleton-detail-grid"><section className="skeleton-detail-panel"><SkeletonListRows count={5} compact /></section><section className="skeleton-detail-panel"><SkeletonListRows count={4} compact /></section></div><div className="skeleton-form"><Skeleton className="skeleton-word skeleton-section-title" /><Skeleton className="skeleton-input" /><Skeleton className="skeleton-input is-tall" /></div></AdminPageSkeleton>;
}
