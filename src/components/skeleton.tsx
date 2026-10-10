import { PRODUCT_NAME } from "@/src/lib/branding";
import { PageHeader, SectionCard } from "./page-header";
import { LinkarMark } from "./linkar-mark";

type SkeletonProps = { className?: string; style?: React.CSSProperties };

/** One decorative loading shape. Structure and spacing belong to its parent composition. */
export function Skeleton({ className = "", style }: SkeletonProps) {
  return <span className={`skeleton-block ${className}`.trim()} style={style} aria-hidden />;
}

export function RootSkeleton() {
  return <main className="root-loading" aria-busy="true" aria-live="polite"><span className="brand root-loading-logo" aria-label={PRODUCT_NAME}><LinkarMark className="brand-mark" /><span className="brand-name">{PRODUCT_NAME}</span></span></main>;
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
  return <div className="page-wrap skeleton-page" role="region" aria-label={label} aria-busy="true">{header ?? <PageHeaderSkeleton />}{children}</div>;
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
    <LoadingRegion label="Loading inbox activity" className="ibx-desk ibx-desk-loading">
      <div className="ibx-list">
        <div className="ibx-list-head" aria-hidden>
          <Skeleton className="skeleton-word skeleton-section-title" />
          <Skeleton className="skeleton-search" />
          <div className="skeleton-chip-row"><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /><Skeleton className="skeleton-chip" /></div>
        </div>
        <SkeletonListRows count={6} compact />
      </div>
      <div className="ibx-thread ibx-thread-blank" aria-hidden>
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

/** Same KPI row and Reply volume card as Home, then the two detail cards. */
export function InsightsContentSkeleton() {
  return (
    <LoadingRegion label="Loading insights data" className="skeleton-content skeleton-insights-content">
      <KpiSkeletonRow />
      <SectionCard className="chart-panel" title="Reply volume" description="Replies sent and people reached per day, last 14 days."><DashboardChartSkeleton /></SectionCard>
      <div className="insights-detail-grid" aria-hidden>
        <SectionCard title="Automation journey" description="Where people currently sit in your flows."><SkeletonListRows count={4} compact /></SectionCard>
        <SectionCard title="Content performance" description="Top posts by matched comments."><SkeletonListRows count={3} compact /></SectionCard>
      </div>
    </LoadingRegion>
  );
}

export function DashboardChartSkeleton() {
  return <div className="dashboard-chart-skeleton" aria-label="Loading performance data" aria-busy="true"><div className="skeleton-chart-bars" aria-hidden>{Array.from({ length: 14 }, (_, index) => <Skeleton className={`skeleton-chart-bar h-${(index % 5) + 1}`} key={index} />)}</div></div>;
}

/** Rows shaped like the automation table: channel tile, name over its rule,
 * channel column, then the status switch and action icons. */
function AutomationRowsSkeleton({ count }: { count: number }) {
  return (
    <div className="automation-skeleton-rows" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-list-row automation-skeleton-row" key={index}>
          <div className="automation-identity">
            <Skeleton className="automation-skeleton-tile" />
            <div className="skeleton-stack skeleton-row-copy">
              <Skeleton className="skeleton-word automation-skeleton-name" />
              <div className="automation-skeleton-rule"><Skeleton className="skeleton-word automation-skeleton-source" /><Skeleton className="automation-skeleton-keyword" /><Skeleton className="skeleton-word automation-skeleton-response" /></div>
            </div>
          </div>
          <div className="skeleton-stack automation-skeleton-channel"><Skeleton className="skeleton-word skeleton-note" /><Skeleton className="skeleton-word automation-skeleton-surface" /></div>
          <div className="automation-skeleton-actions"><Skeleton className="automation-skeleton-switch" />{Array.from({ length: 5 }, (_, icon) => <Skeleton className="automation-skeleton-icon" key={icon} />)}</div>
        </div>
      ))}
    </div>
  );
}

export function AutomationListContentSkeleton({ count = 5 }: { count?: number }) {
  return <LoadingRegion label="Loading automations" className="skeleton-content automation-skeleton-list"><AutomationRowsSkeleton count={count} /></LoadingRegion>;
}

export function ScreenSkeleton() { return <WorkspaceScreen label="Loading workspace"><SkeletonListRows count={4} /></WorkspaceScreen>; }

/** Mirrors StatTile: icon + label, value, note. Shared by Home and Insights. */
function KpiSkeletonRow() {
  return (
    <div className="kpi-grid" aria-hidden>
      {Array.from({ length: 4 }, (_, index) => (
        <div className="kpi-tile stat-tile" key={index}>
          <div className="stat-block">
            <span className="stat-head"><span className="stat-label"><Skeleton className="stat-icon-skeleton" /><Skeleton className="skeleton-word skeleton-row-meta" /></span></span>
            <span className="stat-value-row"><Skeleton className="kpi-skeleton" /></span>
            <Skeleton className="skeleton-word skeleton-note" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <WorkspaceScreen
      label="Loading Home"
      header={<PageHeader className="home-greeting" title={<Skeleton className="skeleton-word skeleton-title" />} description="Welcome back - here’s how your replies performed over the last 14 days." actions={<Skeleton className="skeleton-button" />} />}
    >
      <KpiSkeletonRow />
      <SectionCard className="chart-panel" title="Reply volume" description="Replies sent and people reached per day, last 14 days."><DashboardChartSkeleton /></SectionCard>
      <div className="dashboard-columns">
        <SectionCard className="automations-panel" title="Your automations"><SkeletonListRows count={3} compact /></SectionCard>
        <SectionCard title="Recent failures"><SkeletonListRows count={3} compact /></SectionCard>
      </div>
    </WorkspaceScreen>
  );
}

/** Content-only placeholder for the automation sections; the persistent
 * sections layout already renders the header and section switch, so this
 * only mirrors the body of the section being opened. */
export function AutomationSectionContentSkeleton({ section = "my" }: { section?: "my" | "sequences" | "broadcasts" }) {
  if (section !== "my") {
    return (
      <div className="split-layout skeleton-section-content" aria-label={`Loading ${section}`} aria-busy="true">
        <SectionCard flush className="automations-surface" title={section === "sequences" ? "Sequences" : "Broadcasts"} description={<Skeleton className="skeleton-word skeleton-row-meta" />}>
          <AutomationRowsSkeleton count={3} />
        </SectionCard>
        <div className="surface skeleton-composer" aria-hidden>
          <Skeleton className="skeleton-word skeleton-section-title" />
          <Skeleton className="skeleton-word skeleton-row-meta" />
          <div className="skeleton-stack"><Skeleton className="skeleton-word skeleton-note" /><Skeleton className="skeleton-input" /></div>
          <div className="skeleton-stack"><Skeleton className="skeleton-word skeleton-note" /><Skeleton className="skeleton-input" /></div>
          <div className="skeleton-stack"><Skeleton className="skeleton-word skeleton-note" /><Skeleton className="skeleton-input is-tall" /></div>
          <Skeleton className="skeleton-button" />
        </div>
      </div>
    );
  }
  return (
    <div className="page-stack skeleton-section-content" aria-label="Loading automations" aria-busy="true">
      <section className="settings-overview automations-summary" aria-hidden>
        {["Total", "Active", "Paused", "Drafts"].map((label) => (
          <div className="settings-overview-cell" key={label}><small>{label}</small><Skeleton className="skeleton-word automation-skeleton-count" /></div>
        ))}
      </section>
      <section className="surface is-flush automations-surface" aria-hidden>
        <div className="list-toolbar"><Skeleton className="automation-skeleton-search" /><Skeleton className="automation-skeleton-filter" /></div>
        <div className="automation-columns"><span>Automation</span><span>Channel</span><span>Status</span></div>
        <AutomationRowsSkeleton count={4} />
      </section>
    </div>
  );
}

/** Campaign performance: KPI row, funnel bars beside the side panels, then
 * the participant table. `withHeader` adds the page frame for the route. */
export function CampaignPerformanceSkeleton({ withHeader = false }: { withHeader?: boolean }) {
  const body = (
    <div className="activity-list campaign-performance-view" aria-hidden>
      <KpiSkeletonRow />
      <div className="campaign-overview has-aside">
        <SectionCard className="campaign-funnel" title="Conversion funnel" description="Share of commenters who reached each stage.">
          <div className="funnel-bars">
            {[100, 92, 46, 45, 45].map((width, index) => (
              <div className="funnel-bar-row" key={index}>
                <Skeleton className="skeleton-word skeleton-note" />
                <span className="funnel-bar-track"><Skeleton className="funnel-bar-skeleton" style={{ width: `${width}%` }} /></span>
                <Skeleton className="skeleton-word funnel-count-skeleton" />
                <Skeleton className="skeleton-word funnel-count-skeleton" />
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard className="side-panel" title="Plan usage" description="Participants counted this month.">
          <Skeleton className="skeleton-word skeleton-input" style={{ height: 8 }} />
          <Skeleton className="skeleton-word skeleton-row-meta" />
        </SectionCard>
      </div>
      <SectionCard flush className="campaign-participants" title="Participants" description={<Skeleton className="skeleton-word skeleton-row-meta" />}>
        <div className="list-toolbar"><Skeleton className="automation-skeleton-filter" /><Skeleton className="automation-skeleton-search" /></div>
        <SkeletonListRows count={5} compact />
      </SectionCard>
    </div>
  );
  if (!withHeader) return <LoadingRegion label="Loading campaign activity">{body}</LoadingRegion>;
  return (
    <div className="page-wrap campaign-analytics-page skeleton-page" role="region" aria-label="Loading campaign performance" aria-busy="true">
      <PageHeader title={<Skeleton className="skeleton-word skeleton-title-sm" />} description="Campaign performance: from comment to delivered link." actions={<><Skeleton className="skeleton-button" /><Skeleton className="skeleton-button" /></>} />
      {body}
    </div>
  );
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
