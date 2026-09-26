import { PRODUCT_NAME } from "@/src/lib/branding";

type SkeletonProps = { className?: string; style?: React.CSSProperties };

/** One decorative loading shape. Structure and spacing belong to its parent composition. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <span className={`skeleton-block ${className}`.trim()} style={style} aria-hidden />;
}

export function RootSkeleton() {
  return <main className="root-loading" aria-busy="true" aria-live="polite"><span className="brand root-loading-logo" aria-label={PRODUCT_NAME}><span className="brand-name">{PRODUCT_NAME}</span></span></main>;
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

function WorkspaceScreen({ label, children, header }: { label: string; children: React.ReactNode; header?: React.ReactNode }) {
  // Route loading.tsx files render inside the persistent (app) layout. A
  // second app-frame here duplicated the sidebar and nested a full-width main
  // column inside its content slot, especially breaking narrow viewports.
  return <main className="page-wrap skeleton-page" aria-label={label} aria-busy="true">{header ?? <PageHeaderSkeleton />}{children}</main>;
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
    <LoadingRegion label="Loading inbox activity" className="conversation-desk conversation-desk-loading">
      <div className="conversation-roster">
        <div className="conversation-roster-head" aria-hidden>
          <div><Skeleton className="skeleton-word skeleton-section-title" /><Skeleton className="skeleton-word skeleton-note" /></div>
          <Skeleton className="skeleton-search" />
          <div className="skeleton-chip-row"><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /></div>
        </div>
        <SkeletonListRows count={6} compact />
      </div>
      <div className="conversation-panel conversation-loading-panel" aria-hidden>
        <Skeleton className="skeleton-avatar skeleton-avatar-lg" />
        <Skeleton className="skeleton-word skeleton-section-title" />
        <Skeleton className="skeleton-word skeleton-lede" />
      </div>
    </LoadingRegion>
  );
}

export function QuickReelsContentSkeleton() {
  return <LoadingRegion label="Loading Reels" className="quick-reel-grid skeleton-reel-grid">{Array.from({ length: 4 }, (_, index) => <div className="skeleton-reel" key={index}><Skeleton className="skeleton-reel-media" /><Skeleton className="skeleton-word skeleton-row-title" /><Skeleton className="skeleton-word skeleton-row-meta" /></div>)}</LoadingRegion>;
}

export function SettingsConnectionsContentSkeleton() {
  return <LoadingRegion label="Loading connected channels" className="connected-channels-list settings-connection-skeleton">{[0, 1].map((index) => <div className="channel-settings-card" key={index}><div className="channel-identity"><Skeleton className="skeleton-avatar" /><div className="skeleton-stack skeleton-row-copy"><Skeleton className="skeleton-word skeleton-row-title" /><Skeleton className="skeleton-word skeleton-row-meta" /></div></div><SkeletonListRows count={2} compact /></div>)}</LoadingRegion>;
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

export function DashboardChartSkeleton() {
  return <div className="dashboard-chart-skeleton" aria-label="Loading performance data" aria-busy="true"><SkeletonMetrics count={3} /><div className="skeleton-chart-bars" aria-hidden>{Array.from({ length: 14 }, (_, index) => <Skeleton className={`skeleton-chart-bar h-${(index % 5) + 1}`} key={index} />)}</div></div>;
}

export function AutomationListContentSkeleton({ count = 5, withToolbar = false }: { count?: number; withToolbar?: boolean }) {
  return <LoadingRegion label="Loading automations" className="skeleton-content">{withToolbar ? <SkeletonToolbar filters={3} /> : null}<SkeletonListRows count={count} /></LoadingRegion>;
}

export function ScreenSkeleton() { return <WorkspaceScreen label="Loading workspace"><SkeletonListRows count={4} /></WorkspaceScreen>; }

export function DashboardSkeleton() {
  return <WorkspaceScreen label="Loading Home" header={<header className="page-header home-greeting"><div><p className="eyebrow">Home</p><Skeleton className="skeleton-word skeleton-title" /><p className="muted page-lede">Welcome back - here’s how your replies performed over the last 14 days.</p></div><Skeleton className="skeleton-button" /></header>}><section className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">Performance · Last 14 days</p><h2>Reply volume</h2></div></div><DashboardChartSkeleton /></section><section className="panel automations-panel"><div className="panel-heading"><div><p className="eyebrow">At a glance</p><h2>Your automations</h2></div></div><SkeletonListRows count={4} compact /></section></WorkspaceScreen>;
}

export function AutomationsSkeleton() { return <WorkspaceScreen label="Loading Automations" header={<header className="page-header"><div><p className="eyebrow">Workspace / automation</p><h1>Automations</h1><p className="muted page-lede">Rules that turn Instagram and Facebook signals into helpful, timely replies.</p></div></header>}><AutomationListContentSkeleton count={5} withToolbar /></WorkspaceScreen>; }

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
