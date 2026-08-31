import {
  Activity,
  Blocks,
  Bot,
  Database,
  RadioTower,
  ServerCog,
  Users,
} from "lucide-react";

import { MetricCard } from "@/src/components/metric-card";
import type { AdminOverviewDTO } from "@/src/lib/admin/overview";

function stateLabel(name: string, state: string): string {
  if (state === "ok" || state === "configured") return `${name} healthy`;
  if (state === "not_configured") return `${name} not configured`;
  return `${name} degraded`;
}

function conciseTime(value: string): string {
  return value.replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function AdminOverviewScreen({ overview }: { overview: AdminOverviewDTO }) {
  const connectionTotal = overview.connections.instagram + overview.connections.facebook;
  const queueDepth = overview.queue.waiting + overview.queue.active + overview.queue.delayed;

  return (
    <main className="page-wrap admin-overview">
      <header className="page-header">
        <div>
          <p className="eyebrow">Linkar operator / live state</p>
          <h1>Platform overview</h1>
          <p className="muted page-lede">Bounded cross-tenant totals, dependency health, and the latest delivery and owner activity.</p>
        </div>
        <div className={`admin-release ${overview.health.status === "ok" ? "is-ok" : "is-degraded"}`}>
          <ServerCog size={16} aria-hidden />
          {overview.health.release ? `Release ${overview.health.release}` : "Release unavailable"}
        </div>
      </header>

      <section className="metrics-grid" aria-label="Platform totals">
        <MetricCard label="Active workspaces" value={String(overview.workspaces.active)} note={`${overview.workspaces.suspended} suspended`} icon={Blocks} tone="saffron" />
        <MetricCard label="Active users" value={String(overview.users.active)} note="Unique workspace identities" icon={Users} tone="mint" />
        <MetricCard label="Connections" value={String(connectionTotal)} note={`${overview.connections.instagram} Instagram · ${overview.connections.facebook} Facebook`} icon={RadioTower} tone="lavender" />
        <MetricCard label="Active automations" value={String(overview.automations.active)} note="Across every workspace" icon={Bot} tone="saffron" />
      </section>

      <section className="admin-overview-grid">
        <article className="panel admin-health-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Runtime</p><h2>System pulse</h2></div>
            <Database size={20} aria-hidden />
          </div>
          <div className="admin-status-grid">
            {[
              ["Database", overview.health.database],
              ["Redis", overview.health.redis],
              ["Instagram", overview.health.instagram],
              ["Facebook", overview.health.facebook],
            ].map(([name, state]) => (
              <div className="admin-status-row" key={name}>
                <span className={`status-dot is-${state}`} aria-hidden />
                <strong>{stateLabel(name, state)}</strong>
              </div>
            ))}
          </div>
          <div className="admin-queue-strip">
            <span><strong>{queueDepth}</strong> in flight</span>
            <span><strong>{overview.queue.failed}</strong> failed</span>
            <span className={`status-pill is-${overview.queue.state}`}>Queue {overview.queue.state.replace("_", " ")}</span>
          </div>
        </article>

        <article className="panel admin-tape-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Latest 20</p><h2>Operator tape</h2></div>
            <Activity size={20} aria-hidden />
          </div>
          {overview.operatorTape.length === 0 ? (
            <div className="empty-state admin-tape-empty">
              <h3>No recent operator or delivery events</h3>
              <p>New audited actions and automation failures will appear here.</p>
            </div>
          ) : (
            <ol className="admin-tape-list">
              {overview.operatorTape.map((item) => (
                <li key={item.id} className={`admin-tape-item is-${item.status}`}>
                  <span className="admin-tape-marker" aria-hidden />
                  <div>
                    <div className="admin-tape-title"><strong>{item.title}</strong><span>{item.kind}</span></div>
                    <p>{item.detail}</p>
                    <small><time dateTime={item.at}>{conciseTime(item.at)}</time>{item.workspaceId ? ` · ${item.workspaceId}` : ""}</small>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>
    </main>
  );
}
