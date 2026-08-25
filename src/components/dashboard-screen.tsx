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
import { CreateAutomationButton } from "./create-automation-button";
import { FailurePanel } from "./failure-panel";
import { TrackedLinksPanel } from "./tracked-links-panel";
import { StatusBadge } from "./status-badge";
import { TemplatePickerModal } from "./template-picker-modal";
import type { AutomationRecord } from "@/src/lib/repository";
import { getInstagramConnections } from "@/src/lib/client/workspace-data";

// Mirrors DailyCount in src/lib/repository.ts - the key is `day`, not `date`.
type DayPoint = { day: string; count: number };
type InsightsPayload = {
  timeseries?: { participantsPerDay?: DayPoint[]; sentPerDay?: DayPoint[] };
  capturedEmails?: number;
  optedOut?: number;
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

function flowTriggerLabel(automation: AutomationRecord): string {
  const trigger = automation.definition.trigger as { type?: string } | undefined;
  if (trigger?.type === "message") return "DM keywords";
  if (trigger?.type === "first_contact") return "First-contact welcome";
  if (trigger?.type === "story_mention") return "Story mentions";
  return "Comment replies";
}

function formatDayLabel(day: string | undefined): string {
  if (!day) return "";
  const dayOfMonth = Number(day.slice(-2));
  return Number.isFinite(dayOfMonth) ? String(dayOfMonth) : day.slice(-2);
}

/** Two-series bar chart, matching the pattern already used on the Insights page. */
function VolumeChart({ sentPoints, reachedPoints }: { sentPoints: DayPoint[]; reachedPoints: DayPoint[] }) {
  const reachedByDay = new Map(reachedPoints.map((point) => [point.day, point.count]));
  const peak = Math.max(1, ...sentPoints.map((point) => point.count), ...reachedPoints.map((point) => point.count));
  // Any day with real activity still reads as a bar, not a sliver - plain
  // count/peak scaling flattens modest, evenly-spread real-world numbers.
  const heightOf = (count: number) => (count > 0 ? Math.max(10, Math.round((count / peak) * 100)) : 2);
  const hasActivity = sentPoints.some((point) => point.count > 0) || reachedPoints.some((point) => point.count > 0);

  if (!hasActivity) {
    // All-zero fortnight: an empty plot with 2px slivers at the bottom reads as
    // broken, so swap the whole plot for a calm empty state.
    return (
      <p className="chart-empty">
        No replies in the last 14 days yet - once your automations start sending, daily activity shows up here.
      </p>
    );
  }

  return (
    <>
      <div className="chart-plot">
        <div className="insights-chart" role="img" aria-label="Daily replies sent and people reached for the last 14 days">
          {sentPoints.map((point) => {
            const reached = reachedByDay.get(point.day) ?? 0;
            const isEmpty = point.count === 0 && reached === 0;
            return (
              <div
                className={isEmpty ? "chart-column is-empty" : "chart-column"}
                key={point.day}
                title={`${formatDayLabel(point.day)} - ${point.count} sent, ${reached} reached`}
              >
                <div className="chart-bars is-lg">
                  <span className="chart-bar bar-participants" style={{ height: `${heightOf(reached)}%` }} />
                  <span className="chart-bar bar-sent" style={{ height: `${heightOf(point.count)}%` }} />
                </div>
                <small>{formatDayLabel(point.day)}</small>
              </div>
            );
          })}
        </div>
      </div>
      <p className="chart-legend">
        <span className="legend-swatch swatch-sent" /> Replies sent
        <span className="legend-swatch swatch-participants" /> People reached
      </p>
    </>
  );
}

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
          Welcome back - here’s how your replies performed over the last 14 days.
        </p>
      </div>
      <CreateAutomationButton className="button button-primary">
        <Plus size={17} /> Create automation
      </CreateAutomationButton>
    </header>
  );
}

/**
 * A single connected rail instead of three equal-weight cards: done steps
 * recede, the next one is the only thing visually asking for attention.
 */
function SetupChecklist({ automations, hasConnection, loading }: { automations: AutomationRecord[]; hasConnection: boolean | null; loading: boolean }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  if (hasConnection === null || loading) return null;
  const steps = [
    {
      key: "connect",
      done: hasConnection === true,
      title: "Connect your Instagram account",
      hint: "Link a professional account so replies can be sent.",
      href: "/settings",
    },
    {
      key: "create",
      done: automations.length > 0,
      title: "Create your first automation",
      hint: "Start from a template or build one from scratch.",
      href: null,
    },
    {
      key: "activate",
      done: automations.some((automation) => automation.status === "ACTIVE"),
      title: "Activate it and go live",
      hint: "Active flows reply to real comments and DMs instantly.",
      href: "/automations",
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  if (completed === steps.length) return null;
  const nextIndex = steps.findIndex((step) => !step.done);

  return (
    <section className="setup-panel" aria-label="First steps">
      <div className="setup-head">
        <div>
          <h2>Your next best moves</h2>
          <p>Three quick steps to get your first useful reply live.</p>
        </div>
        <span className="setup-count">{completed}/{steps.length} done</span>
      </div>
      <div className="setup-rail">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;
          const rowClassName = `setup-row ${step.done ? "is-done" : ""} ${isNext ? "is-next" : ""}`;
          const content = (
            <>
              <span className="setup-node">{step.done ? <CheckCircle2 size={17} /> : index + 1}</span>
              <span className="setup-copy">
                <strong>{step.title}</strong>
                <small>{step.hint}</small>
              </span>
              {step.done ? (
                <span className="setup-done-tag"><CheckCircle2 size={13} /> Done</span>
              ) : (
                <span className="setup-cta">{isNext ? "Do this now" : "Quick setup"} <ArrowRight size={13} /></span>
              )}
            </>
          );
          if (step.href === null) {
            return (
              <button key={step.key} type="button" className={rowClassName} onClick={() => setPickerOpen(true)}>
                {content}
              </button>
            );
          }
          return (
            <Link key={step.key} className={rowClassName} href={step.href}>
              {content}
            </Link>
          );
        })}
      </div>
      {pickerOpen && <TemplatePickerModal onClose={() => setPickerOpen(false)} />}
    </section>
  );
}

export function DashboardScreen() {
  const { automations, loading } = useAutomations();
  const [demoMode, setDemoMode] = useState(false);
  const [capturedCount, setCapturedCount] = useState<number | null>(null);
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
    getInstagramConnections()
      .then((connections) => setHasConnection(connections.length > 0))
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

        <section aria-label="Start here">
          <div className="quickstart-head">
            <h2>Start here</h2>
            <button className="text-link" type="button" onClick={() => setPickerOpen(true)}>
              Explore all templates <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="quickstart-grid">
            <Link className="quickstart-card" href="/automations/new?type=classic&template=comment-link-dm">
              <strong>Auto-DM links from comments</strong>
              <span className="quickstart-card-meta">
                <span><Zap size={13} /> Quick Automation</span>
                <span className="quickstart-badge">Popular</span>
              </span>
            </Link>
            <Link className="quickstart-card" href="/automations/new?type=classic&template=story-mention-reply">
              <strong>Turn story mentions into DMs</strong>
              <span className="quickstart-card-meta">
                <span><Zap size={13} /> Quick Automation</span>
              </span>
            </Link>
            <Link className="quickstart-card" href="/automations/new?type=classic&template=default-reply">
              <strong>Respond to all your DMs</strong>
              <span className="quickstart-card-meta">
                <span><Zap size={13} /> Quick Automation</span>
              </span>
            </Link>
          </div>
        </section>

        <SetupChecklist automations={automations} hasConnection={hasConnection} loading={loading} />

        <section className="panel chart-panel" aria-label="Performance over time">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Performance · Last 14 days</p>
              <h2>Reply volume</h2>
            </div>
          </div>
          <div className="stat-row">
            <div className="stat-block">
              <span className="stat-label">Replies sent</span>
              <span className="stat-value-row">
                <strong>{sentTotal.toLocaleString()}</strong>
                <DeltaPill delta={sentDelta} />
              </span>
            </div>
            <div className="stat-block">
              <span className="stat-label">People reached</span>
              <span className="stat-value-row">
                <strong>{reachedTotal.toLocaleString()}</strong>
                <DeltaPill delta={reachedDelta} />
              </span>
            </div>
            <div className="stat-block">
              <span className="stat-label">Emails captured</span>
              <span className="stat-value-row">
                <strong>{(capturedCount ?? insights?.capturedEmails ?? 0).toLocaleString()}</strong>
                <NeutralPill>all time</NeutralPill>
              </span>
            </div>
            <div className="stat-block">
              <span className="stat-label">Opted out</span>
              <span className="stat-value-row">
                <strong>{(insights?.optedOut ?? 0).toLocaleString()}</strong>
                <NeutralPill>respected</NeutralPill>
              </span>
            </div>
            <div className="stat-block">
              <span className="stat-label">Active flows</span>
              <span className="stat-value-row">
                <strong>{activeCount}</strong>
                <NeutralPill>{automations.length} total</NeutralPill>
              </span>
            </div>
          </div>
          <VolumeChart sentPoints={sentPerDay} reachedPoints={participantsPerDay} />
        </section>

        <section className="panel automations-panel" aria-label="Your automations">
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
            <div className="empty-state">
              <span className="empty-icon"><Workflow size={20} /></span>
              <h3>No automations yet</h3>
              <p>Create your first reply flow to start answering comments and DMs automatically.</p>
              <CreateAutomationButton className="button button-primary">
                <Plus size={15} /> New automation
              </CreateAutomationButton>
            </div>
          ) : (
            <div className="automation-list">
              {flowRows.map((automation) => (
                <Link className="automation-row" key={automation.id} href={`/automations/${automation.id}/edit`}>
                  <span className="automation-icon">
                    {automation.status === "ACTIVE" ? <Zap size={19} strokeWidth={1.7} /> : <Workflow size={19} strokeWidth={1.7} />}
                  </span>
                  <span className="automation-copy">
                    <span className="automation-title"><strong>{automation.name}</strong><StatusBadge status={automation.status} /></span>
                    <p>{flowTriggerLabel(automation)}</p>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section className="panel failure-panel" aria-label="Recent failures">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Health</p>
              <h2>Recent failures</h2>
              <p className="muted">The last 50 deliveries that Meta or our webhooks rejected.</p>
            </div>
          </div>
          <FailurePanel />
        </section>
        <section className="card" aria-labelledby="tracked-links-heading">
          <TrackedLinksPanel />
        </section>
        {pickerOpen && <TemplatePickerModal onClose={() => setPickerOpen(false)} />}
      </div>
    </AppShell>
  );
}
