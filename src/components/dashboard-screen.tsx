"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  MailCheck,
  Plus,
  Power,
  RefreshCw,
  Send,
  UsersRound,
  Workflow,
  Zap,
} from "lucide-react";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { useAccountIdentity } from "./app-shell";
import { useAutomations } from "./automation-list";
import { CreateAutomationButton } from "./create-automation-button";
import { FailurePanel } from "./failure-panel";
import { TrackedLinksPanel } from "./tracked-links-panel";
import { LocalStatusBadge, lifecycleStatus } from "./workspace-primitives";
import type { AutomationRecord } from "@/src/lib/repository";
import { getFacebookPages, getInstagramConnections, getInsightsOverview, seedWorkspaceData } from "@/src/lib/client/workspace-data";
import type { DayPoint } from "./reply-volume-chart";
import { ReplyVolumeCard } from "./reply-volume-card";
import { halfWindowDelta, StatGrid, StatTile } from "./stat-tile";
import { PageHeader, SectionCard } from "./page-header";
import { greetingFor } from "@/src/lib/display-name";

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
  /** Profile display name, when the account has one; wins over the email. */
  initialDisplayName?: string;
};

/**
 * How long the overview may stay unanswered before Home stops showing loading
 * placeholders and offers a retry. Without a bound, a request that never
 * settles left every stat tile and the chart as skeletons indefinitely.
 */
export const INSIGHTS_TIMEOUT_MS = 15_000;

type InsightsStatus = "loading" | "ready" | "error";

function withTimeout<T>(request: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out loading performance data")), ms);
    request.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function flowTriggerLabel(automation: AutomationRecord): string {
  // Exhaustive over every trigger type so a new one can't silently read as a
  // comment flow (referral and opt-in taps used to).
  const type = automation.definition.trigger.type;
  switch (type) {
    case "comment": return "Comment replies";
    case "message": return "Words in a message";
    case "first_contact": return "First-message welcome";
    case "story_mention": return "Story mentions";
    case "story_reply": return "Story replies";
    case "referral": return "Referral link taps";
    case "optin": return "Permission button taps";
    default: {
      const unhandled: never = type;
      return String(unhandled);
    }
  }
}

/** The three recipes a new workspace sees first; each says what it does, not just its name. */
const QUICKSTART_TEMPLATES = [
  { id: "comment-link-dm", title: "Send a link when someone comments", detail: "Someone comments a keyword, they get your link in a DM.", popular: true },
  { id: "story-mention-reply", title: "Turn story mentions into DMs", detail: "Thank people who tag you in their story, automatically.", popular: false },
  { id: "default-reply", title: "Respond to all your DMs", detail: "Send a friendly first reply to every new message.", popular: false },
] as const;

function DemoBanner() {
  const { mode } = useAccountIdentity();
  if (mode !== "demo") return null;
  return (
    <div className="demo-banner">
      <span className="signal-dot" />
      <div>
        <strong>You’re in demo mode.</strong>
        <span> Explore the builder with sample data. </span>
        <Link href="/settings">Connect an account</Link>
      </div>
    </div>
  );
}

function DashboardGreeting({ fallbackEmail = "", displayName }: { fallbackEmail?: string; displayName?: string }) {
  const { email: contextEmail } = useAccountIdentity();
  // The context email arrives with the client bootstrap; the server-passed
  // fallback paints the real name in the very first render.
  const email = contextEmail || fallbackEmail;
  return (
    <PageHeader
      className="home-greeting"
      title={greetingFor(email, displayName)}
      description="Here’s how your replies did over the last 14 days."
      actions={(
        <>
          <CreateAutomationButton className="button button-secondary">
            <Plus size={16} aria-hidden /> New automation
          </CreateAutomationButton>
          <Link className="button button-primary" href="/quick-automation">
            <Zap size={16} aria-hidden /> Quick automation
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
          <h2>Get your first reply live</h2>
          <p>Three steps. Most people finish in a few minutes.</p>
        </div>
        <span className="setup-count">{completed} of {steps.length} done</span>
      </div>
      <div className="setup-rail">
        {steps.map((step, index) => {
          const isNext = index === nextIndex;
          const rowClassName = `setup-row ${step.done ? "is-done" : ""} ${isNext ? "is-next" : ""}`;
          const content = (
            <>
              <span className="setup-node" aria-hidden>{step.done ? <CheckCircle2 size={17} /> : index + 1}</span>
              <span className="setup-copy">
                <strong>{step.title}</strong>
                <small>{step.hint}</small>
              </span>
              {step.done ? (
                <span className="setup-done-tag">Done</span>
              ) : isNext ? (
                <span className="setup-cta">Start</span>
              ) : null}
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

export function DashboardScreen({ initialAutomations, initialInsights, initialHasConnection, initialEmail, initialDisplayName }: DashboardScreenProps = {}) {
  const { automations, loading, error: automationsError = "", reload: reloadAutomations } = useAutomations(initialAutomations);
  // A failed load must not read as a brand-new workspace: no "Start here",
  // no "create your first automation", no "No automations yet".
  const automationsFailed = Boolean(automationsError) && automations.length === 0;
  const [insights, setInsights] = useState<InsightsPayload | null>(initialInsights ?? null);
  // Explicit status instead of inferring "loading" from `insights === null`:
  // a failed or never-settling request used to leave that null forever, and
  // the stat tiles (which had no error branch) stayed skeletons for good.
  const [insightsStatus, setInsightsStatus] = useState<InsightsStatus>(initialInsights ? "ready" : "loading");
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
      withTimeout(getInsightsOverview(), INSIGHTS_TIMEOUT_MS)
        .then((payload) => {
          if (active) { setInsights(payload); setInsightsStatus("ready"); }
        })
        // A failed background refresh keeps the last good numbers on screen;
        // only a load with nothing to show yet turns into the error state.
        .catch(() => { if (active) setInsightsStatus((status) => status === "ready" ? status : "error"); });
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
  const insightsLoading = insightsStatus === "loading";
  const insightsFailed = insightsStatus === "error";
  // Only a resolved overview can say "nothing happened": before it arrives
  // every total reads zero, and claiming no activity to an established
  // account would be a lie.
  const hasPerformanceHistory =
    insightsStatus !== "ready" ||
    sentTotal > 0 ||
    reachedTotal > 0 ||
    capturedTotal > 0 ||
    optedOutTotal > 0;
  /** Unavailable numbers read as a dash, never as a fake zero. */
  const statValue = (value: number) => insightsFailed ? "–" : value;
  const unavailableNote = "Couldn’t load";

  function retryInsights() {
    setInsightsStatus("loading");
    void withTimeout(getInsightsOverview(), INSIGHTS_TIMEOUT_MS)
      .then((payload) => { setInsights(payload); setInsightsStatus("ready"); })
      .catch(() => setInsightsStatus("error"));
  }

  const activeFlows = automations.filter((a) => a.status === "ACTIVE");
  const pausedFlows = automations.filter((a) => a.status !== "ACTIVE");
  const flowRows = [
    ...activeFlows.slice(0, 5),
    ...pausedFlows.slice(0, Math.max(0, 5 - activeFlows.length)),
  ];

  return (
    <>
      <div className="page-wrap ws-page dashboard-page">
        <DashboardGreeting fallbackEmail={initialEmail ?? ""} displayName={initialDisplayName} />

        <DemoBanner />

        {!loading && !automationsFailed && automations.length === 0 ? <section className="quickstart" aria-label="Start here">
          <div className="quickstart-head">
            <div>
              <h2>Start here</h2>
              <p>Pick a template. You can change every word before it goes live.</p>
            </div>
            <button className="text-link" type="button" onClick={() => setPickerOpen(true)}>
              Browse all templates
            </button>
          </div>
          <div className="quickstart-grid">
            {QUICKSTART_TEMPLATES.map((template) => (
              <Link className="quickstart-card" key={template.id} href={`/automations/new?type=classic&template=${template.id}`}>
                <span className="quickstart-card-title">
                  <strong>{template.title}</strong>
                  {template.popular ? <span className="quickstart-badge">Popular</span> : null}
                </span>
                <span className="quickstart-card-meta">{template.detail}</span>
              </Link>
            ))}
          </div>
        </section> : null}

        {automationsFailed ? null : <SetupChecklist automations={automations} hasConnection={hasConnection} loading={loading} />}

        <StatGrid>
          <StatTile label="Replies sent" icon={Send} loading={insightsLoading} value={statValue(sentTotal)} note={insightsFailed ? unavailableNote : "Last 14 days"} delta={insightsFailed ? null : sentDelta} trend={insightsFailed ? undefined : sentPerDay} />
          <StatTile label="People reached" icon={UsersRound} loading={insightsLoading} value={statValue(reachedTotal)} note={insightsFailed ? unavailableNote : "Last 14 days"} delta={insightsFailed ? null : reachedDelta} trend={insightsFailed ? undefined : participantsPerDay} />
          <StatTile label="Emails captured" icon={MailCheck} loading={insightsLoading} value={statValue(capturedTotal)} note={insightsFailed ? unavailableNote : optedOutTotal > 0 ? `${optedOutTotal.toLocaleString()} opted out` : "All time"} />
          <StatTile label="Automations on" icon={Power} loading={loading && automations.length === 0} value={automationsFailed ? "–" : activeCount} note={automationsFailed ? unavailableNote : `Out of ${automations.length.toLocaleString()}`} />
        </StatGrid>

        <ReplyVolumeCard
          sent={sentPerDay}
          reached={participantsPerDay}
          days={14}
          loading={insightsLoading}
          action={<Link className="text-link" href="/insights">View insights</Link>}
          placeholder={insightsFailed ? (
            <div className="chart-state" role="alert">
              <p>Reply activity didn’t load. Check your connection and try again.</p>
              <button className="button button-secondary button-small" type="button" onClick={retryInsights}><RefreshCw size={15} aria-hidden /> Try again</button>
            </div>
          ) : !hasPerformanceHistory ? (
            <div className="chart-state">
              <span className="chart-state-icon" aria-hidden><BarChart3 size={20} /></span>
              <p>No replies yet in the last 14 days. Daily activity shows up here once an automation sends its first reply.</p>
              {/* A new workspace already has three ways to create one above;
                  only an established one needs pointing at its automations. */}
              {automations.length > 0 ? (
                <Link className="button button-secondary button-small" href="/automations">Check your automations</Link>
              ) : null}
            </div>
          ) : undefined}
        />

        <div className="dashboard-columns">
          <SectionCard
            className="automations-panel"
            flush
            aria-label="Your automations"
            title="Your automations"
            description={automations.length > 0 ? `${activeCount} of ${automations.length} on` : undefined}
            action={automations.length > 0 ? <Link className="text-link" href="/automations">View all</Link> : undefined}
          >
            {automationsFailed ? (
              <div className="empty-state is-inline" role="alert">
                <h3>Your automations didn’t load</h3>
                <p>Check your connection and try again.</p>
                <button className="button button-secondary button-small" type="button" onClick={() => void reloadAutomations?.()}>
                  <RefreshCw size={15} aria-hidden /> Try again
                </button>
              </div>
            ) : flowRows.length === 0 ? (
              <div className="empty-state is-inline">
                <span className="empty-icon"><Workflow size={20} /></span>
                <h3>No automations yet</h3>
                <p>Create one to start answering comments and messages automatically.</p>
                <CreateAutomationButton className="button button-secondary button-small">
                  <Plus size={15} aria-hidden /> New automation
                </CreateAutomationButton>
              </div>
            ) : (
              <div className="automation-list">
                {flowRows.map((automation) => (
                  <Link className="automation-row" key={automation.id} href={`/automations/${automation.id}/edit`}>
                    {/* The channel, not a decorative bolt: it's the one thing the name doesn't say. */}
                    <span className="automation-icon is-channel" aria-hidden>
                      {automation.provider === "FACEBOOK" || automation.facebookPageId
                        ? <FacebookGlyph size={17} brand />
                        : <InstagramGlyph size={17} brand />}
                    </span>
                    <span className="automation-copy">
                      <span className="automation-title"><strong>{automation.name}</strong><LocalStatusBadge {...lifecycleStatus(automation.status)} /></span>
                      <p>{flowTriggerLabel(automation)}</p>
                    </span>
                    <ArrowRight className="row-chevron" size={15} aria-hidden />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
          <SectionCard
            className="failure-panel"
            aria-label="Recent failures"
            title="Recent failures"
            description="Messages that couldn’t be sent, and why."
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
