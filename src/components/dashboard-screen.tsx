"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Plus,
  Workflow,
  Zap,
} from "lucide-react";
import { AppShell, useAccountIdentity } from "./app-shell";
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

function automationStatusLabel(status: AutomationRecord["status"]): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
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

function displayNameFromEmail(email: string): string {
  const handle = email.split("@")[0] ?? "";
  const words = handle.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "there";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function DashboardGreeting() {
  const { email } = useAccountIdentity();
  return (
    <header className="page-header home-greeting">
      <div>
        <p className="eyebrow">Home</p>
        <h1>Hello, {displayNameFromEmail(email)}!</h1>
        <p className="muted page-lede">
          Welcome back — here’s how your replies performed over the last 14 days.
        </p>
      </div>
      <Link className="button button-primary" href="/automations/new">
        <Plus size={17} /> Create automation
      </Link>
    </header>
  );
}

/** ManyChat-style first-steps checklist, derived from real workspace state. */
function OnboardingGuide({ automations, hasConnection, loading }: { automations: AutomationRecord[]; hasConnection: boolean | null; loading: boolean }) {
  if (hasConnection === null || loading) return null;
  const steps = [
    {
      key: "connect",
      done: hasConnection === true,
      title: "Connect your Instagram account",
      hint: "Link a professional account so replies can be sent.",
      href: "/settings",
      icon: Zap,
    },
    {
      key: "create",
      done: automations.length > 0,
      title: "Create your first automation",
      hint: "Start from a template or build one from scratch.",
      href: "/automations/new",
      icon: Plus,
    },
    {
      key: "activate",
      done: automations.some((automation) => automation.status === "ACTIVE"),
      title: "Activate it and go live",
      hint: "Active flows reply to real comments and DMs instantly.",
      href: "/automations",
      icon: Workflow,
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  const percent = Math.round((completed / steps.length) * 100);
  if (completed === steps.length) return null;

  return (
    <section className="onboarding-panel" aria-label="First steps">
      <div className="onboarding-head">
        <div>
          <h2>Start here</h2>
          <p>Three quick steps to get your first useful reply live.</p>
        </div>
        <div className="onboarding-progress">
          <strong>{completed}/{steps.length} complete</strong>
          <span className="onboarding-track">
            <span className="onboarding-fill" style={{ width: `${percent}%` }} />
          </span>
        </div>
      </div>
      <ul className="onboarding-steps" data-stagger>
        {steps.map((step) => {
          const Icon = step.icon;
          return (
          <li key={step.key}>
            <Link className={`onboarding-step ${step.done ? "is-done" : ""}`} href={step.href}>
              <span className="onboarding-icon">
                <Icon size={18} />
              </span>
              <span className="onboarding-copy">
                <strong>{step.title}</strong>
                <small>{step.hint}</small>
              </span>
              <span className="onboarding-status">
                {step.done ? <><CheckCircle2 size={13} /> Complete</> : <>Quick setup</>}
              </span>
              <ArrowRight className="onboarding-arrow" size={15} />
            </Link>
          </li>
          );
        })}
      </ul>
    </section>
  );
}

export function DashboardScreen() {
  const { automations, loading } = useAutomations();
  const [demoMode, setDemoMode] = useState(false);
  const [capturedCount, setCapturedCount] = useState<number | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);

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
    fetch("/api/meta/connection")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { data?: unknown[] } | null) => setHasConnection((payload?.data?.length ?? 0) > 0))
      .catch(() => undefined);
  }, []);

  const activeCount = automations.filter((a) => a.status === "ACTIVE").length;

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

        <DashboardGreeting />

        <OnboardingGuide automations={automations} hasConnection={hasConnection} loading={loading} />

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
                  const inactive = automation.status !== "ACTIVE";
                  const tone = FLOW_TONES[index % FLOW_TONES.length];
                  return (
                    <li key={automation.id}>
                      <Link
                        className={`flow-chip ${tone} ${inactive ? "is-paused" : ""}`}
                        href={`/automations/${automation.id}/edit`}
                      >
                        <span className="flow-chip-icon">
                          {inactive ? <Workflow size={16} /> : <Zap size={16} />}
                        </span>
                        <span className="flow-meta">
                          <strong>{automation.name}</strong>
                          <small>{inactive ? automationStatusLabel(automation.status) : flowTriggerLabel(automation)}</small>
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
