"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Plus, Workflow, Zap } from "lucide-react";
import { AppShell } from "./app-shell";
import { useAutomations } from "./automation-list";
import type { AutomationRecord } from "@/src/lib/repository";

// Mirrors DailyCount in src/lib/repository.ts — the key is `day`, not `date`.
type DayPoint = { day: string; count: number };
type InsightsPayload = {
  timeseries?: { participantsPerDay?: DayPoint[]; sentPerDay?: DayPoint[] };
};

type Delta = { dir: "up" | "down" | "flat"; label: string };

function sumPoints(points?: DayPoint[]): number {
  return (points ?? []).reduce((total, point) => total + (point.count ?? 0), 0);
}

function halfWindowDelta(points?: DayPoint[]): Delta | null {
  const days = points ?? [];
  if (days.length < 4) return null;
  const mid = Math.floor(days.length / 2);
  const recent = sumPoints(days.slice(mid));
  const previous = sumPoints(days.slice(0, mid));
  if (recent > 0 && previous === 0) return { dir: "up", label: "new" };
  if (previous === 0 || recent + previous === 0) return null;
  const pct = Math.round(((recent - previous) / previous) * 100);
  if (pct === 0) return { dir: "flat", label: "0%" };
  return pct > 0
    ? { dir: "up", label: `+${pct}% vs prior wk` }
    : { dir: "down", label: `${pct}% vs prior wk` };
}

function NeutralPill({ children }: { children: ReactNode }) {
  return <span className="delta-pill">{children}</span>;
}

function flowTriggerLabel(automation: AutomationRecord): string {
  const trigger = automation.definition.trigger as { type?: string } | undefined;
  if (trigger?.type === "message") return "Active · DM keywords";
  if (trigger?.type === "first_contact") return "Active · first-contact welcome";
  if (trigger?.type === "story_mention") return "Active · story mentions";
  return "Active · comment replies";
}

function DeltaPill({ delta }: { delta?: Delta | null }) {
  if (!delta) return null;
  if (delta.dir === "flat") return <NeutralPill>{delta.label}</NeutralPill>;
  return (
    <span className="delta-pill" data-dir={delta.dir}>
      {delta.dir === "up" ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
      {delta.label}
    </span>
  );
}

function formatDayLabel(day: string | undefined): string {
  if (!day) return "";
  const dayOfMonth = Number(day.slice(-2));
  return Number.isFinite(dayOfMonth) ? String(dayOfMonth) : day.slice(-2);
}

function VitalsChart({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  const total = sumPoints(points);
  const avg = points.length ? total / points.length : 0;
  const avgPct = Math.max(2, Math.min(96, Math.round((avg / max) * 100)));
  return (
    <>
      <div className="vitals-plot">
        {points.map((point) => (
          <div
            key={point.day}
            className="vitals-col"
            title={`${formatDayLabel(point.day)} — ${point.count} sent`}
          >
            <div
              className="vitals-bar"
              style={{ height: `${Math.max(3, Math.round(((point.count ?? 0) / max) * 100))}%` }}
            />
          </div>
        ))}
        {total > 0 && (
          <div className="vitals-avg" style={{ bottom: `${avgPct}%` }} aria-hidden>
            <span>daily avg</span>
          </div>
        )}
      </div>
      <div className="vitals-xrow">
        {points.map((point) => (
          <span key={`x-${point.day}`} className="vitals-x">
            {formatDayLabel(point.day)}
          </span>
        ))}
      </div>
    </>
  );
}

const FLOW_TONES = ["flow-a", "flow-b", "flow-c"] as const;

export function DashboardScreen() {
  const { automations, loading } = useAutomations();
  const [demoMode, setDemoMode] = useState(false);
  const [capturedCount, setCapturedCount] = useState<number | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((health: { mode?: string }) => setDemoMode(health.mode === "demo"))
      .catch(() => undefined);
    fetch("/api/contacts")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: { count: number } } | null) =>
        setCapturedCount(payload?.data?.count ?? 0)
      )
      .catch(() => undefined);
    fetch("/api/insights")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: InsightsPayload | null) => setInsights(payload))
      .catch(() => undefined);
  }, []);

  const activeCount = automations.filter((a) => a.status === "ACTIVE").length;

  useEffect(() => {
    void fetch("/api/health")
      .then((response) => response.json())
      .then((health: { mode?: string }) => setDemoMode(health.mode === "demo"))
      .catch(() => setDemoMode(false));
    void fetch("/api/contacts")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: { count: number } } | null) => setCapturedCount(payload?.data?.count ?? 0))
      .catch(() => undefined);
  }, []);

  const sentPerDay = insights?.timeseries?.sentPerDay ?? [];
  const participantsPerDay = insights?.timeseries?.participantsPerDay ?? [];
  const sentTotal = sumPoints(sentPerDay);
  const reachedTotal = sumPoints(participantsPerDay);
  const sentDelta = halfWindowDelta(sentPerDay);
  const reachedDelta = halfWindowDelta(participantsPerDay);

  const activeFlows = automations.filter((a) => a.status === "ACTIVE");
  const pausedFlows = automations.filter((a) => a.status !== "ACTIVE");
  const flowRows = [
    ...activeFlows.slice(0, 5),
    ...pausedFlows.slice(0, Math.max(0, 5 - activeFlows.length)),
  ];

  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>Dashboard</h1>
            <p className="muted page-lede">
              Welcome back — here’s how your replies performed over the last 14 days.
            </p>
          </div>
          <Link className="button button-primary" href="/automations/new">
            <Plus size={17} /> Create automation
          </Link>
        </header>

        {demoMode ? (
          <div className="demo-banner">
            <span className="signal-dot" />
            <div>
              <strong>You’re in demo mode.</strong>
              <span> Explore the builder with sample data. </span>
              <Link href="/settings">Connect account <ArrowUpRight size={13} /></Link>
            </div>
          </div>
        ) : null}

        <section className="panel perf-panel" aria-label="Performance over time">
          <div className="panel-heading">
            <h2>Performance over time</h2>
            <p className="perf-range">Last 14 days</p>
          </div>

          <div className="perf-strip">
            <div className="perf-cell">
              <span className="perf-label">Replies sent</span>
              <span className="perf-row">
                <strong className="perf-value">{sentTotal.toLocaleString()}</strong>
                <DeltaPill delta={sentDelta} />
              </span>
            </div>
            <div className="perf-cell">
              <span className="perf-label">People reached</span>
              <span className="perf-row">
                <strong className="perf-value">{reachedTotal.toLocaleString()}</strong>
                <DeltaPill delta={reachedDelta} />
              </span>
            </div>
            <div className="perf-cell">
              <span className="perf-label">Emails captured</span>
              <span className="perf-row">
                <strong className="perf-value">
                  {(capturedCount ?? 0).toLocaleString()}
                </strong>
                <NeutralPill>all time</NeutralPill>
              </span>
            </div>
            <div className="perf-cell">
              <span className="perf-label">Active flows</span>
              <span className="perf-row">
                <strong className="perf-value">{activeCount}</strong>
                <NeutralPill>{automations.length} total</NeutralPill>
              </span>
            </div>
          </div>
        </section>

        <div className="dashboard-grid">
          <section className="panel chart-panel" aria-label="Reply volume">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Volume</p>
                <h2>Reply volume</h2>
              </div>
              <div className="chart-legend">
                <span><i data-tone="forest" /> Replies sent</span>
              </div>
            </div>
            <VitalsChart points={sentPerDay} />
          </section>

          <aside className="panel flows-panel" aria-label="Your automations">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">At a glance</p>
                <h2>Your automations</h2>
              </div>
              <Link className="text-link" href="/automations">
                Manage all <ArrowUpRight size={13} />
              </Link>
            </div>
            {flowRows.length === 0 ? (
              <div className="flows-empty">
                <Workflow size={20} />
                <p>No automations yet. Create your first reply flow.</p>
                <Link className="button button-secondary" href="/automations/new">
                  <Plus size={15} /> New automation
                </Link>
              </div>
            ) : (
              <ul className="flow-list">
                {flowRows.map((automation, index) => {
                  const paused = automation.status !== "ACTIVE";
                  const tone = FLOW_TONES[index % FLOW_TONES.length];
                  return (
                    <li key={automation.id}>
                      <Link
                        className={`flow-chip ${tone} ${paused ? "is-paused" : ""}`}
                        href={`/automations/${automation.id}/edit`}
                      >
                        <span className="flow-chip-icon">
                          {paused ? <Workflow size={16} /> : <Zap size={16} />}
                        </span>
                        <span className="flow-meta">
                          <strong>{automation.name}</strong>
                          <small>{paused ? "Paused" : flowTriggerLabel(automation)}</small>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
