"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  MailCheck,
  Plus,
  Power,
  Send,
  UsersRound,
  Workflow,
  Zap,
} from "lucide-react";
import { useAccountIdentity } from "./app-shell";
import { useAutomations } from "./automation-list";
import { CreateAutomationButton } from "./create-automation-button";
import { FailurePanel } from "./failure-panel";
import { TrackedLinksPanel } from "./tracked-links-panel";
import { StatusBadge } from "./status-badge";
import type { AutomationRecord } from "@/src/lib/repository";
import { getFacebookPages, getInstagramConnections, getInsightsOverview, seedWorkspaceData } from "@/src/lib/client/workspace-data";
import type { DayPoint } from "./reply-volume-chart";
import { ReplyVolumeCard } from "./reply-volume-card";
import { halfWindowDelta, StatGrid, StatTile } from "./stat-tile";
import { PageHeader, SectionCard } from "./page-header";

const TemplatePickerModal = dynamic(() => import("./template-picker-modal").then((module) => module.TemplatePickerModal));

type InsightsPayload = {
  timeseries?: { days?: number; participantsPerDay?: DayPoint[]; sentPerDay?: DayPoint[] };
  capturedEmails?: number;
  optedOut?: number;
};

export type DashboardScreenProps = {
  /** Server-rendered into the page payload by app/(app)/dashboard/page.tsx. */
  initialAutomations?: AutomationRecord[];
  initialInsights?: InsightsPayload;
  initialHasConnection?: boolean;
  /** Session email from the server render, so the greeting needs no bootstrap wait. */
  initialEmail?: string;
};

function flowTriggerLabel(automation: AutomationRecord): string {
  const trigger = automation.definition.trigger as { type?: string } | undefined;
  if (trigger?.type === "message") return "Words in a message";
  if (trigger?.type === "first_contact") return "First-message welcome";
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

function DashboardGreeting({ fallbackEmail = "" }: { fallbackEmail?: string }) {
  const { email: contextEmail } = useAccountIdentity();
  // The context email arrives with the client bootstrap; the server-passed
  // fallback paints the real name in the very first render.
  const email = contextEmail || fallbackEmail;
  return (
    <PageHeader
      className="home-greeting"
      title={`Hello, ${displayNameFromEmail(email)}!`}
      description="Welcome back - here’s how your replies performed over the last 14 days."
      actions={(
        <>
          <CreateAutomationButton className="button button-secondary">
            <Plus size={16} /> New automation
          </CreateAutomationButton>
          <Link className="button button-primary" href="/quick-automation">
            <Zap size={16} /> Quick Automation
          </Link>
        </>
      )}
    />
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
      hint: "Replies that are on can answer matching comments and messages.",
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

export function DashboardScreen({ initialAutomations, initialInsights, initialHasConnection, initialEmail }: DashboardScreenProps = {}) {
  const { automations, loading } = useAutomations(initialAutomations);
  const [insights, setInsights] = useState<InsightsPayload | null>(initialInsights ?? null);
  const [insightsError, setInsightsError] = useState(false);
  const [hasConnection, setHasConnection] = useState<boolean | null>(() => initialHasConnection ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Seed the shared insights cache so the refresh effect below resolves
  // instantly and every later consumer (e.g. /insights) reuses the
  // server-rendered data. Runs before the refresh effect in mount order.
  useEffect(() => {
    if (initialInsights) seedWorkspaceData({ insightsOverview: initialInsights });
  }, [initialInsights]);

  useEffect(() => {
    let active = true;
    function refresh() {
      // Deliberately not fetching /api/contacts for the captured-lead count:
      // /api/insights already returns it as capturedEmails off the same
      // countCapturedContacts() query, and the contacts route pages in 50
      // contact rows on top. One fewer authenticated round trip per load.
      getInsightsOverview()
        .then((payload) => {
          if (active) { setInsights(payload); setInsightsError(false); }
        })
        .catch(() => { if (active) setInsightsError(true); });
      Promise.all([
        getInstagramConnections().catch(() => []),
        getFacebookPages().catch(() => []),
      ]).then(([connections, pages]) => {
        if (active) setHasConnection(connections.length > 0 || pages.length > 0);
      });
    }
    refresh();
    // Resource freshness prevents tab focus from producing a burst of repeat
    // requests. Connection mutations invalidate their own entries, while
    // older confirmed entries refresh after the shared freshness window.
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const activeCount = automations.filter((a) => a.status === "ACTIVE").length;

  const sentPerDay = insights?.timeseries?.sentPerDay ?? [];
  const participantsPerDay = insights?.timeseries?.participantsPerDay ?? [];
  const sumPoints = (points: DayPoint[]) => points.reduce((total, point) => total + point.count, 0);
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
    <>
      <div className="page-wrap">
        <DashboardGreeting fallbackEmail={initialEmail ?? ""} />

        <DemoBanner />

        {!loading && automations.length === 0 ? <section aria-label="Start here">
          <div className="quickstart-head">
            <h2>Start here</h2>
            <button className="text-link" type="button" onClick={() => setPickerOpen(true)}>
              Explore all templates <ArrowUpRight size={13} />
            </button>
          </div>
          <div className="quickstart-grid">
            <Link className="quickstart-card" href="/automations/new?type=classic&template=comment-link-dm">
              <strong>Send a link when someone comments</strong>
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

        <StatGrid>
          <StatTile label="Replies sent" icon={Send} loading={insights === null} value={sentTotal} note="Last 14 days" delta={sentDelta} />
          <StatTile label="People reached" icon={UsersRound} loading={insights === null} value={reachedTotal} note="Last 14 days" delta={reachedDelta} />
          <StatTile label="Emails captured" icon={MailCheck} loading={insights === null} value={capturedTotal} note={`${optedOutTotal.toLocaleString()} opted out · respected`} />
          <StatTile label="Replies that are on" icon={Power} loading={loading && automations.length === 0} value={activeCount} note={`of ${automations.length.toLocaleString()} automations`} />
        </StatGrid>

        <ReplyVolumeCard
          sent={sentPerDay}
          reached={participantsPerDay}
          days={14}
          loading={insights === null}
          action={<Link className="text-link" href="/insights">Open insights <ArrowUpRight size={13} /></Link>}
          placeholder={insightsError && insights === null ? (
            <div className="panel-empty" role="alert">Performance data could not load. <button className="text-link" type="button" onClick={() => {
              setInsightsError(false);
              void getInsightsOverview().then(setInsights).catch(() => setInsightsError(true));
            }}>Retry</button></div>
          ) : insights !== null && !hasPerformanceHistory ? (
            <p className="panel-empty">
              No activity yet - once an automation replies, you’ll see replies sent, people reached and
              emails captured here.
            </p>
          ) : undefined}
        />

        <div className="dashboard-columns">
          <SectionCard
            className="automations-panel"
            flush
            aria-label="Your automations"
            title="Your automations"
            description={automations.length > 0 ? `${activeCount} of ${automations.length} switched on` : undefined}
            action={<Link className="text-link" href="/automations">Manage all <ArrowUpRight size={13} /></Link>}
          >
            {flowRows.length === 0 ? (
              <div className="empty-state is-inline">
                <span className="empty-icon"><Workflow size={20} /></span>
                <h3>No automations yet</h3>
                <p>Create your first automatic reply to start answering comments and messages.</p>
                <CreateAutomationButton className="button button-primary">
                  <Plus size={15} /> New automation
                </CreateAutomationButton>
              </div>
            ) : (
              <div className="automation-list">
                {flowRows.map((automation) => (
                  <Link className="automation-row" key={automation.id} href={`/automations/${automation.id}/edit`}>
                    <span className="automation-icon">
                      {automation.status === "ACTIVE" ? <Zap size={17} strokeWidth={1.8} /> : <Workflow size={17} strokeWidth={1.8} />}
                    </span>
                    <span className="automation-copy">
                      <span className="automation-title"><strong>{automation.name}</strong><StatusBadge status={automation.status} /></span>
                      <p>{flowTriggerLabel(automation)}</p>
                    </span>
                    <ArrowRight className="row-chevron" size={15} />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard
            className="failure-panel"
            aria-label="Recent failures"
            title="Recent failures"
            description="Messages Linkar or Meta could not send, with the reason when available."
          >
            <FailurePanel limit={4} />
          </SectionCard>
        </div>

        <section className="surface" aria-labelledby="tracked-links-heading">
          <TrackedLinksPanel />
        </section>
        {pickerOpen && <TemplatePickerModal onClose={() => setPickerOpen(false)} />}
      </div>
    </>
  );
}
