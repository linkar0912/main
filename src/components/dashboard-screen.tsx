"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Check, ChevronDown, Link2, Plus, RefreshCw, Zap } from "lucide-react";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { useAccountIdentity } from "./app-shell";
import { useAutomations } from "./automation-list";
import { CreateAutomationButton } from "./create-automation-button";
import { FailureList, fetchRecentFailures, type DeliveryFailure } from "./failure-panel";
import { LocalStatusBadge, lifecycleStatus } from "./workspace-primitives";
import { StatusBadge } from "./ui/status-badge";
import { Presence } from "./ui/use-presence";
import { Collapse } from "./ui/collapse";
import { PageHeader, SectionCard } from "./page-header";
import { Skeleton } from "./skeleton";
import { WindowTrendChart } from "./trend-chart";
import { PerformanceFigure, PeriodChangeNote } from "./performance-figures";
import { RangeSwitch } from "./range-switch";
import { useRangePreference } from "./ui/use-range-preference";
import type { AutomationRecord } from "@/src/lib/repository";
import { getFacebookPages, getInstagramConnections, getInsightsOverview, seedWorkspaceData, type InsightsOverview } from "@/src/lib/client/workspace-data";
import { DEFAULT_RANGE, parseRange, type AnalyticsRange } from "@/src/lib/analytics-range";
import { greetingFor } from "@/src/lib/display-name";
import { deriveAttentionItems, type AttentionConnection, type AttentionItem } from "@/src/lib/home-attention";
import { sumPoints } from "@/src/lib/insights-summary";
import { recommendTemplates } from "@/src/lib/onboarding/recommendations";
import type { Goal } from "@/src/lib/onboarding/answers";
import { OnboardingInviteCard, RecommendedLabel, YourPlanCard } from "./onboarding/home-onboarding";

const TemplatePickerModal = dynamic(() => import("./template-picker-modal").then((module) => module.TemplatePickerModal));

type InsightsPayload = InsightsOverview;

type PlanUsage = { deliveriesThisMonth: number; monthlyDeliveryLimit: number | null };

export type DashboardScreenProps = {
  /** Server-rendered into the page payload by app/(app)/dashboard/page.tsx. */
  initialAutomations?: AutomationRecord[];
  initialInsights?: InsightsPayload;
  initialHasConnection?: boolean;
  /** Session email from the server render, so the greeting needs no bootstrap wait. */
  initialEmail?: string;
  /** Profile display name, when the account has one; wins over the email. */
  initialDisplayName?: string;
  /** `?range=` as the server read it, so the first paint shows the chosen window. */
  initialRange?: AnalyticsRange | null;
};

/**
 * How long the overview may stay unanswered before Home stops showing loading
 * placeholders and offers a retry. Without a bound, a request that never
 * settles left every figure and the chart as skeletons indefinitely.
 */
export const INSIGHTS_TIMEOUT_MS = 15_000;

/** Where this browser remembers Home's 7 / 14 / 30-day choice. */
export const HOME_RANGE_KEY = "linkar.home.range";

type InsightsStatus = "loading" | "ready" | "error";

/**
 * First-load choreography, in ms after mount: header, status line, the
 * performance panel whose figures count up while the line draws, the
 * automation rows, then the "Needs you" rows below them (or, for a new
 * workspace, the guided start right under the header). Everything settles by
 * ~700ms and nothing replays on a background refresh.
 */
const ENTER = { header: 0, status: 45, start: 90, panel: 90, figures: 115, list: 175, attention: 260 } as const;

/** Figures start counting this long after their panel starts to appear. */
const FIGURE_DELAY = ENTER.figures - ENTER.panel;

function enterStyle(delay: number): CSSProperties {
  return { "--enter-delay": `${delay}ms` } as CSSProperties;
}

function withTimeout<T>(request: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out loading performance data")), ms);
    request.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function fetchPlanUsage(): Promise<PlanUsage | null> {
  const response = await fetch("/api/insights?include=usage");
  const payload = (await response.json().catch(() => ({}))) as { usage?: PlanUsage };
  return response.ok && payload.usage ? payload.usage : null;
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

/** "@studio.kavya", "@studio.kavya and Studio Kavya", "@a, @b and 2 more". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
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
        <Link href="/settings">Connect an account</Link>
      </div>
    </div>
  );
}

/**
 * "Is Linkar working for me?" in one line under the greeting: a status dot,
 * where it is replying from, how much of the setup is switched on and,
 * when it is true, that nothing needs attention.
 */
function StatusLine({ connections, automations, automationsKnown, allClear }: {
  connections: AttentionConnection[] | null;
  automations: AutomationRecord[];
  automationsKnown: boolean;
  allClear: boolean;
}) {
  if (connections === null) return <span className="home-status is-pending">Checking your connected accounts…</span>;
  const live = connections.filter((connection) => connection.status === "CONNECTED")
    .map((connection) => connection.kind === "instagram" ? `@${connection.name.replace(/^@/, "")}` : connection.name);
  const active = automations.filter((automation) => automation.status === "ACTIVE").length;
  let tone: "success" | "neutral" | "danger" = "neutral";
  let sentence: string;
  if (live.length > 0 && automationsKnown && active > 0) {
    tone = "success";
    sentence = `Replying on ${joinNames(live)}. ${active} of ${automations.length} automation${automations.length === 1 ? " is" : "s are"} on.`;
  } else if (live.length > 0) {
    sentence = automationsKnown && automations.length > 0
      ? `Connected to ${joinNames(live)}. No automations are on yet.`
      : `Connected to ${joinNames(live)}.`;
  } else if (connections.length > 0) {
    tone = "danger";
    sentence = "Not replying right now. Your account needs reconnecting.";
  } else {
    sentence = "No account connected yet.";
  }
  return (
    <span className="home-status" data-tone={tone}>
      <span className="home-status-dot" aria-hidden />
      <span>{sentence}</span>
      {allClear ? <span className="home-all-clear"><Check size={15} strokeWidth={2.4} aria-hidden /> Nothing needs you right now.</span> : null}
    </span>
  );
}

function HomeHeader({ fallbackEmail, displayName, status }: { fallbackEmail: string; displayName?: string; status: ReactNode }) {
  const { email: contextEmail } = useAccountIdentity();
  // The context email arrives with the client bootstrap; the server-passed
  // fallback paints the real name in the very first render.
  const email = contextEmail || fallbackEmail;
  return (
    <PageHeader
      className="home-greeting home-enter"
      title={greetingFor(email, displayName)}
      description={status}
      actions={(
        // "New automation" is in the top bar; Home keeps only the quick path.
        <Link className="button button-secondary" href="/quick-automation">
          <Zap size={16} aria-hidden /> Quick automation
        </Link>
      )}
    />
  );
}

/** "Does anything need me?" Only rendered when the answer is yes. */
function NeedsYou({ items, failures }: { items: AttentionItem[]; failures: DeliveryFailure[] }) {
  const [failuresOpen, setFailuresOpen] = useState(false);
  return (
    <section className="home-attention" aria-labelledby="home-attention-heading">
      <h2 id="home-attention-heading" className="home-section-title home-enter" style={enterStyle(ENTER.attention)}>Needs you</h2>
      <ul className="attention-list">
        {items.map((item, index) => (
          <li key={item.key} className="attention-row home-enter" data-tone={item.tone} style={enterStyle(ENTER.attention + Math.min(index, 5) * 45)}>
            <div className="attention-main">
              <StatusBadge tone={item.tone} label={item.chip} className="attention-chip" />
              <p className="attention-text">{item.text}</p>
              {item.action.kind === "link" ? (
                <Link className="button button-secondary button-small attention-action" href={item.action.href}>{item.action.label}</Link>
              ) : (
                <button
                  type="button"
                  className="button button-secondary button-small attention-action"
                  aria-expanded={failuresOpen}
                  aria-controls="home-failures"
                  onClick={() => setFailuresOpen((open) => !open)}
                >
                  {failuresOpen ? "Hide" : item.action.label}
                  <ChevronDown size={15} aria-hidden className="attention-chevron" />
                </button>
              )}
            </div>
            {item.action.kind === "failures" ? (
              <Collapse open={failuresOpen} id="home-failures">
                {failuresOpen && (
                  <div className="attention-detail">
                    <FailureList failures={failures} limit={4} />
                  </div>
                )}
              </Collapse>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * "Is it working?" in numbers: the two figures are the chart's legend.
 * Everything but "Emails collected" (all time) follows the 7 / 14 / 30-day
 * switch. While another window loads, the last numbers stay on screen,
 * dimmed, and the chart redraws once the new window lands.
 */
function PerformancePanel({ status, insights, shownDays, range, onRangeChange, switchFailed, onRetry }: {
  status: InsightsStatus;
  insights: InsightsPayload | null;
  /** The window the numbers on screen describe; differs from `range` while it loads. */
  shownDays: AnalyticsRange;
  range: AnalyticsRange;
  onRangeChange: (range: AnalyticsRange) => void;
  /** The chosen window failed to load while an older one is still showing. */
  switchFailed: boolean;
  onRetry: () => void;
}) {
  const sentPerDay = insights?.timeseries?.sentPerDay ?? [];
  const reachedPerDay = insights?.timeseries?.participantsPerDay ?? [];
  const sent = sumPoints(sentPerDay);
  const reached = sumPoints(reachedPerDay);
  const captured = insights?.capturedEmails ?? 0;
  const optedOut = insights?.optedOut ?? 0;
  const ready = status === "ready";
  const hasActivity = sent > 0 || reached > 0;
  const pending = ready && range !== shownDays && !switchFailed;

  return (
    <section className="surface home-performance home-enter" aria-label="Performance over time" aria-busy={pending || undefined} data-pending={pending ? "" : undefined} style={enterStyle(ENTER.panel)}>
      <div className="home-panel-head">
        <h2 className="home-section-title">Last {range} days</h2>
        <div className="home-panel-tools">
          <RangeSwitch value={range} onChange={onRangeChange} className="home-range" />
          <Link className="text-link" href="/insights">View insights</Link>
        </div>
      </div>
      {switchFailed ? (
        <div className="home-range-error" role="alert">
          <p>The last {range} days didn’t load. These are the last {shownDays} days.</p>
          <button className="button button-secondary button-small" type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden /> Try again</button>
        </div>
      ) : null}
      {status === "error" ? (
        <div className="chart-state" role="alert">
          <p>Reply activity didn’t load. Check your connection and try again.</p>
          <button className="button button-secondary button-small" type="button" onClick={onRetry}><RefreshCw size={15} aria-hidden /> Try again</button>
        </div>
      ) : (
        <>
          <div className="perf-figures" role="list" aria-label="Performance summary">
            {status === "loading" ? (
              <>
                <div className="perf-figure" role="listitem"><Skeleton className="perf-figure-skeleton" /><span className="perf-figure-label">Replies sent</span></div>
                <div className="perf-figure" role="listitem"><Skeleton className="perf-figure-skeleton" /><span className="perf-figure-label">People reached</span></div>
              </>
            ) : (
              <>
                <PerformanceFigure value={sent} label="Replies sent" tone="primary" delay={FIGURE_DELAY} change={<PeriodChangeNote current={sent} previous={insights?.previous?.sent} days={shownDays} />} />
                <PerformanceFigure value={reached} label="People reached" tone="secondary" delay={FIGURE_DELAY} change={<PeriodChangeNote current={reached} previous={insights?.previous?.reached} days={shownDays} />} />
                <PerformanceFigure value={captured} label="Emails collected" delay={FIGURE_DELAY} note={optedOut > 0 ? `All time, ${optedOut.toLocaleString("en-IN")} opted out` : "All time"} />
              </>
            )}
          </div>
          {status === "loading" ? (
            <Skeleton className="home-chart-skeleton" />
          ) : ready && !hasActivity ? (
            <div className="chart-state">
              <p>No replies yet in the last {shownDays} days. The daily line starts once an automation sends its first reply.</p>
              <Link className="button button-secondary button-small" href="/automations">Check your automations</Link>
            </div>
          ) : (
            <WindowTrendChart days={shownDays} sentPerDay={sentPerDay} reachedPerDay={reachedPerDay} />
          )}
        </>
      )}
    </section>
  );
}

function AutomationsPanel({ automations, failed, onRetry }: { automations: AutomationRecord[]; failed: boolean; onRetry: () => void }) {
  const active = automations.filter((automation) => automation.status === "ACTIVE");
  const rest = automations.filter((automation) => automation.status !== "ACTIVE");
  const rows = [...active, ...rest].slice(0, 5);
  return (
    <SectionCard
      className="home-automations home-enter"
      style={enterStyle(ENTER.panel + 45)}
      flush
      aria-label="Your automations"
      title="Your automations"
      description={automations.length > 0 ? `${active.length} of ${automations.length} on` : undefined}
      action={automations.length > 0 ? <Link className="text-link" href="/automations">View all</Link> : undefined}
    >
      {failed ? (
        <div className="empty-state is-inline" role="alert">
          <h3>Your automations didn’t load</h3>
          <p>Check your connection and try again.</p>
          <button className="button button-secondary button-small" type="button" onClick={onRetry}>
            <RefreshCw size={15} aria-hidden /> Try again
          </button>
        </div>
      ) : (
        <ul className="home-automation-list">
          {rows.map((automation, index) => (
            <li key={automation.id} className="home-enter" style={enterStyle(ENTER.list + Math.min(index, 5) * 45)}>
              <Link className="home-automation-row" href={`/automations/${automation.id}/edit`}>
                {/* The channel, not a decorative bolt: it's the one thing the name doesn't say. */}
                <span className="home-automation-channel" aria-hidden>
                  {automation.provider === "FACEBOOK" || automation.facebookPageId
                    ? <FacebookGlyph size={16} brand />
                    : <InstagramGlyph size={16} brand />}
                </span>
                <span className="home-automation-copy">
                  <strong title={automation.name}>{automation.name}</strong>
                  <small>{flowTriggerLabel(automation)}</small>
                </span>
                <LocalStatusBadge {...lifecycleStatus(automation.status)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function TrackedLinksRow() {
  return (
    <section className="home-links home-enter" aria-labelledby="home-links-heading" style={enterStyle(ENTER.attention + 90)}>
      <span className="home-links-icon" aria-hidden><Link2 size={17} /></span>
      <div className="home-links-copy">
        <h2 id="home-links-heading">Tracked links</h2>
        <p>Short links that count clicks from your DMs and tag where visitors came from.</p>
      </div>
      <Link className="button button-secondary button-small" href="/insights#tracked-links">Manage links</Link>
    </section>
  );
}

type StepState = "done" | "current" | "todo" | "checking";

/**
 * A brand-new workspace gets a guided start instead of an empty dashboard.
 * It really is a sequence, so the steps are numbered; only the current one
 * is open, finished ones fold to a line with a check.
 */
function GuidedStart({ connections, goals, onBrowseTemplates }: { connections: AttentionConnection[] | null; goals: Goal[]; onBrowseTemplates: () => void }) {
  // With saved onboarding goals the recipes are picked for this person
  // (same ranking as the onboarding plan); otherwise the three defaults.
  const recipes = goals.length > 0
    ? recommendTemplates({ goals }).map((item) => ({ id: item.id, title: item.title, detail: item.why, popular: false, href: item.href }))
    : QUICKSTART_TEMPLATES.map((template) => ({ ...template, href: `/automations/new?type=classic&template=${template.id}` }));
  const connected = connections?.filter((connection) => connection.status === "CONNECTED") ?? [];
  const connectState: StepState = connections === null ? "checking" : connected.length > 0 ? "done" : "current";
  const pickState: StepState = connectState === "done" ? "current" : "todo";
  const names = connected.map((connection) => connection.kind === "instagram" ? `@${connection.name.replace(/^@/, "")}` : connection.name);

  return (
    <section className="surface home-start home-enter" aria-label="Start here" style={enterStyle(ENTER.start)}>
      <div className="home-start-head">
        <h2>Get your first reply live</h2>
        <p>Three steps. Most people finish in a few minutes.</p>
      </div>
      <ol className="start-steps">
        <li className="start-step" data-state={connectState}>
          <span className="start-node" aria-hidden>{connectState === "done" ? <Check size={16} strokeWidth={2.6} /> : 1}</span>
          <div className="start-body">
            <h3>Connect Instagram or a Facebook Page</h3>
            {connectState === "done" ? (
              <p>Connected to {joinNames(names)}.</p>
            ) : connectState === "checking" ? (
              <p>Checking your connected accounts…</p>
            ) : (
              <>
                <p>Linkar replies from the account you connect. It takes about a minute.</p>
                <Link className="button button-primary" href="/settings">Connect an account</Link>
              </>
            )}
          </div>
        </li>
        <li className="start-step" data-state={pickState}>
          <span className="start-node" aria-hidden>2</span>
          <div className="start-body">
            <h3>Pick your first reply</h3>
            <p>Start from a recipe. You can change every word before it goes live.</p>
            {pickState === "current" ? (
              <>
                {goals.length > 0 ? <RecommendedLabel /> : null}
                <div className="start-recipes">
                  {recipes.map((template) => (
                    <Link className="start-recipe" key={template.id} href={template.href}>
                      <span className="start-recipe-title">
                        <strong>{template.title}</strong>
                        {template.popular ? <span className="quickstart-badge">Popular</span> : null}
                      </span>
                      <span className="start-recipe-detail">{template.detail}</span>
                    </Link>
                  ))}
                </div>
                <button className="text-link start-browse" type="button" onClick={onBrowseTemplates}>Browse all templates</button>
              </>
            ) : null}
          </div>
        </li>
        <li className="start-step" data-state="todo">
          <span className="start-node" aria-hidden>3</span>
          <div className="start-body">
            <h3>Turn it on</h3>
            <p>It starts answering matching comments and messages straight away.</p>
          </div>
        </li>
      </ol>
      <p className="home-start-foot">Your numbers show up here after the first reply goes out.</p>
    </section>
  );
}

export function DashboardScreen({ initialAutomations, initialInsights, initialHasConnection, initialEmail, initialDisplayName, initialRange }: DashboardScreenProps = {}) {
  const { automations, loading, error: automationsError = "", reload: reloadAutomations } = useAutomations(initialAutomations);
  const { onboarding, role } = useAccountIdentity();
  // Hidden straight away on dismiss; the server keeps it hidden for good.
  const [inviteHidden, setInviteHidden] = useState(false);
  const [planHidden, setPlanHidden] = useState(false);
  // A failed load must not read as a brand-new workspace: no guided start,
  // no "create your first automation".
  const automationsFailed = Boolean(automationsError) && automations.length === 0;
  const automationsKnown = !loading && !automationsFailed;
  const { range, setRange, ready: rangeReady } = useRangePreference(HOME_RANGE_KEY, initialRange);
  const [insights, setInsights] = useState<InsightsPayload | null>(initialInsights ?? null);
  // The window the numbers on screen describe; trails `range` while a newly
  // chosen window loads, so the old numbers stay up (dimmed) meanwhile.
  const [shownDays, setShownDays] = useState<AnalyticsRange>(parseRange(initialInsights?.timeseries?.days) ?? DEFAULT_RANGE);
  // Explicit status instead of inferring "loading" from `insights === null`:
  // a failed or never-settling request used to leave that null forever.
  const [insightsStatus, setInsightsStatus] = useState<InsightsStatus>(initialInsights ? "ready" : "loading");
  const [switchFailed, setSwitchFailed] = useState(false);
  const rangeRef = useRef(range);
  const shownDaysRef = useRef(shownDays);
  const hasInsightsRef = useRef(Boolean(initialInsights));
  // A server-known "connected" has no names yet; an empty list is only claimed once the request answers.
  const [connections, setConnections] = useState<AttentionConnection[] | null>(() => initialHasConnection === false ? [] : null);
  const [failures, setFailures] = useState<DeliveryFailure[] | null>(null);
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Seed the shared insights cache so the refresh effect below resolves
  // instantly and every later consumer reuses the server-rendered data.
  // Runs before the refresh effect in mount order.
  useEffect(() => {
    if (initialInsights) seedWorkspaceData({ insightsOverview: initialInsights });
  }, [initialInsights]);

  // Deliberately not fetching /api/contacts for the captured-lead count:
  // /api/insights already returns it as capturedEmails off the same
  // countCapturedContacts() query.
  const loadInsights = useCallback((days: AnalyticsRange, isActive: () => boolean = () => true) => {
    withTimeout(getInsightsOverview({ days }), INSIGHTS_TIMEOUT_MS)
      .then((payload) => {
        // A late answer for a window the person already left is dropped.
        if (!isActive() || rangeRef.current !== days) return;
        hasInsightsRef.current = true;
        shownDaysRef.current = days;
        setInsights(payload);
        setShownDays(days);
        setInsightsStatus("ready");
        setSwitchFailed(false);
      })
      // A failed background refresh keeps the last good numbers on screen;
      // only a load with nothing to show yet turns into the error state.
      .catch(() => {
        if (!isActive() || rangeRef.current !== days) return;
        if (hasInsightsRef.current) setSwitchFailed((current) => current || days !== shownDaysRef.current);
        else setInsightsStatus("error");
      });
  }, []);

  // The chosen window: the first load (once the saved choice is known, so a
  // remembered 30 days never fetches 14 first), and every switch after it.
  useEffect(() => {
    if (!rangeReady) return;
    rangeRef.current = range;
    let active = true;
    loadInsights(range, () => active);
    return () => { active = false; };
  }, [range, rangeReady, loadInsights]);

  function chooseRange(next: AnalyticsRange) {
    setSwitchFailed(false);
    setRange(next);
  }

  useEffect(() => {
    let active = true;
    function refresh() {
      Promise.all([
        getInstagramConnections().catch(() => []),
        getFacebookPages().catch(() => []),
      ]).then(([instagram, pages]) => {
        if (!active) return;
        setConnections([
          ...instagram.map((connection) => ({ kind: "instagram" as const, name: connection.username ?? "", status: connection.status ?? "CONNECTED" })),
          ...pages.map((page) => ({ kind: "facebook" as const, name: page.pageName ?? "", status: page.status ?? "CONNECTED" })),
        ]);
      });
    }
    refresh();
    // Resource freshness prevents tab focus from producing a burst of repeat
    // requests. Connection mutations invalidate their own entries, while
    // older confirmed entries refresh after the shared freshness window.
    const onFocus = () => {
      refresh();
      loadInsights(rangeRef.current, () => active);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [loadInsights]);

  // Failures and plan use only feed "Needs you"; a failure to load either
  // simply means no row, never a false alarm.
  useEffect(() => {
    let active = true;
    fetchRecentFailures()
      .then((data) => { if (active) setFailures(data); })
      .catch(() => { if (active) setFailures([]); });
    fetchPlanUsage()
      .then((data) => { if (active) setUsage(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  function retryInsights() {
    if (switchFailed) setSwitchFailed(false);
    else setInsightsStatus("loading");
    loadInsights(range);
  }

  const isNewWorkspace = automationsKnown && automations.length === 0;
  const attention = deriveAttentionItems({ connections, automations, automationsKnown, failures, usage });
  const everythingKnown = connections !== null && automationsKnown && failures !== null;
  const allClear = everythingKnown && attention.length === 0 && !isNewWorkspace;
  const showInvite = Boolean(onboarding?.invite) && role === "OWNER" && !inviteHidden;
  // "Your plan" stands in for the generic guided start until the first
  // automation exists or it is hidden.
  const showPlan = Boolean(onboarding?.planCard) && isNewWorkspace && !planHidden;
  const liveConnection = connections === null ? null : connections.some((connection) => connection.status === "CONNECTED");

  return (
    <div className="page-wrap ws-page dashboard-page home-page">
      <HomeHeader
        fallbackEmail={initialEmail ?? ""}
        displayName={initialDisplayName ?? onboarding?.displayName ?? undefined}
        status={isNewWorkspace ? "Let’s get your first automatic reply live." : (
          <StatusLine connections={connections} automations={automations} automationsKnown={automationsKnown} allClear={allClear} />
        )}
      />

      <DemoBanner />

      {showInvite ? <OnboardingInviteCard onDismiss={() => setInviteHidden(true)} /> : null}

      {isNewWorkspace ? (
        <>
          {showPlan ? (
            <YourPlanCard connected={liveConnection} enterDelay={ENTER.start} onDismiss={() => setPlanHidden(true)} onBrowseTemplates={() => setPickerOpen(true)} />
          ) : (
            <GuidedStart connections={connections} goals={onboarding?.goals ?? []} onBrowseTemplates={() => setPickerOpen(true)} />
          )}
          <TrackedLinksRow />
        </>
      ) : (
        <>
          <div className="home-grid">
            <PerformancePanel
              status={insightsStatus}
              insights={insights}
              shownDays={shownDays}
              range={range}
              onRangeChange={chooseRange}
              switchFailed={switchFailed}
              onRetry={retryInsights}
            />
            {loading && automations.length === 0 ? (
              <section className="surface home-automations" aria-label="Your automations" aria-busy="true">
                <Skeleton className="home-list-skeleton" />
              </section>
            ) : (
              <AutomationsPanel automations={automations} failed={automationsFailed} onRetry={() => void reloadAutomations?.()} />
            )}
          </div>
          {attention.length > 0 ? <NeedsYou items={attention} failures={failures ?? []} /> : null}
          <TrackedLinksRow />
        </>
      )}
      <Presence>{pickerOpen && <TemplatePickerModal goals={onboarding?.goals} onClose={() => setPickerOpen(false)} />}</Presence>
    </div>
  );
}
