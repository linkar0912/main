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
import { clearWorkspaceDataCache, getFacebookPages, getInstagramConnections } from "@/src/lib/client/workspace-data";
import { ReplyVolumeChart, type DayPoint } from "./reply-volume-chart";

type InsightsPayload = {
  timeseries?: { participantsPerDay?: DayPoint[]; sentPerDay?: DayPoint[] };
  capturedEmails?: number;
  optedOut?: number;
};

type Delta = { dir: "up" | "down" | "flat"; label: string };

function sumPoints(points: DayPoint[]): number {
  return points.reduce((total, point) => total + point.count, 0);
}

function halfWindowDelta(points: DayPoint[]): Delta | null {
  if (points.length < 4) return null;
  const mid = Math.floor(points.length / 2);
  const recent = sumPoints(points.slice(mid));
  const previous = sumPoints(points.slice(0, mid));
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

function displayNameFromEmail(email: string): string {
  const handle = email.split("@")[0] ?? "";
  const words = handle.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "there";
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function DemoBanner() {
  const { mode } = useAccountIdentity();
  if (mode !== "demo") return null;
  return (
    <div className="demo-banner">
      <span className="signal-dot" />
      <div>
        <strong>You’re in demo mode.</strong>
        <span> Explore the builder with sample data. </span>
        <Link href="/settings">Connect account <ArrowUpRight size={13} /></Link>
      </div>
    </div>
  );
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
      <Link className="button button-primary" href="/quick-automation">
        <Zap size={17} /> Quick Automation
      </Link>
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
      title: "Connect an Instagram account or Facebook Page",
      hint: "Link at least one supported channel so replies can be sent.",
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
      hint: "Active flows reply to supported comments and messages.",
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
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [hasConnection, setHasConnection] = useState<boolean | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    function refresh() {
      // Deliberately not fetching /api/contacts for the captured-lead count:
      // /api/insights already returns it as capturedEmails off the same
      // countCapturedContacts() query, and the contacts route pages in 50
      // contact rows on top. One fewer authenticated round trip per load.
      fetch("/api/insights?include=overview")
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: InsightsPayload | null) => setInsights(payload))
        .catch(() => undefined);
      // Force a fresh connection lookup so a disconnect performed in the
      // settings tab (or another tab) is reflected on the dashboard as
      // soon as it regains focus. Without the cache invalidation the
      // shared in-memory cache would have served the stale "connected"
      // snapshot from the previous load.
      clearWorkspaceDataCache("connections");
      Promise.all([
        getInstagramConnections().catch(() => []),
        getFacebookPages().catch(() => []),
      ]).then(([connections, pages]) => setHasConnection(connections.length > 0 || pages.length > 0));
    }
    refresh();
    // The dashboard is the workspace overview; a stale "you are connected"
    // banner after a settings-side disconnect is a real UX bug. Refetching
    // on focus is the cheapest fix.
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const activeCount = automations.filter((a) => a.status === "ACTIVE").length;

  const sentPerDay = insights?.timeseries?.sentPerDay ?? [];
  const participantsPerDay = insights?.timeseries?.participantsPerDay ?? [];
  const sentTotal = sumPoints(sentPerDay);
  const reachedTotal = sumPoints(participantsPerDay);
  const sentDelta = halfWindowDelta(sentPerDay);
  const reachedDelta = halfWindowDelta(participantsPerDay);
  const capturedTotal = insights?.capturedEmails ?? 0;
  const optedOutTotal = insights?.optedOut ?? 0;
  // Gate on `insights` having resolved: before it does every total reads zero,
  // and claiming "no activity yet" to an established account would be a lie.
  const hasPerformanceHistory =
    insights === null ||
    sentTotal > 0 ||
    reachedTotal > 0 ||
    capturedTotal > 0 ||
    optedOutTotal > 0;

  const activeFlows = automations.filter((a) => a.status === "ACTIVE");
  const pausedFlows = automations.filter((a) => a.status !== "ACTIVE");
  const flowRows = [
    ...activeFlows.slice(0, 5),
    ...pausedFlows.slice(0, Math.max(0, 5 - activeFlows.length)),
  ];

  return (
    <AppShell>
      <div className="page-wrap">
        <DemoBanner />

        <DashboardGreeting />

        {!loading && automations.length === 0 ? <section aria-label="Start here">
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
        </section> : null}

        <SetupChecklist automations={automations} hasConnection={hasConnection} loading={loading} />

        <section className="panel chart-panel" aria-label="Performance over time">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Performance · Last 14 days</p>
              <h2>Reply volume</h2>
            </div>
          </div>
          {hasPerformanceHistory ? (
            <>
              {/* Tier one: only the two charted series. Each carries its chart
                  swatch, which binds the number to its bars and makes the
                  separate legend line redundant. */}
              <div className="stat-row">
                <div className="stat-block">
                  <span className="stat-label">
                    <span className="legend-swatch swatch-sent" /> Replies sent
                  </span>
                  <span className="stat-value-row">
                    <strong>{sentTotal.toLocaleString()}</strong>
                    <DeltaPill delta={sentDelta} />
                  </span>
                </div>
                <div className="stat-block">
                  <span className="stat-label">
                    <span className="legend-swatch swatch-participants" /> People reached
                  </span>
                  <span className="stat-value-row">
                    <strong>{reachedTotal.toLocaleString()}</strong>
                    <DeltaPill delta={reachedDelta} />
                  </span>
                </div>
              </div>
              {/* Tier two: context and health, not performance - so they read as
                  a quiet strip rather than competing cards. */}
              <dl className="stat-meta">
                <div className="stat-meta-item">
                  <dt>Emails captured</dt>
                  <dd>{capturedTotal.toLocaleString()} <span>all time</span></dd>
                </div>
                <div className="stat-meta-item">
                  <dt>Opted out</dt>
                  <dd>{optedOutTotal.toLocaleString()} <span>respected</span></dd>
                </div>
                <div className="stat-meta-item">
                  <dt>Active flows</dt>
                  <dd>{activeCount.toLocaleString()} <span>of {automations.length.toLocaleString()}</span></dd>
                </div>
              </dl>
              <ReplyVolumeChart sent={sentPerDay} reached={participantsPerDay} days={14} compact />
            </>
          ) : (
            <p className="panel-empty">
              No activity yet - once an automation replies, you’ll see replies sent, people reached and
              emails captured here.
            </p>
          )}
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
