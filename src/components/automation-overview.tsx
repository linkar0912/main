"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { AutomationSummary } from "./automation-summary";
import { AutomationFunnel } from "./automation-funnel";
import { useDeliveryProblems, useWorkspaceConnections } from "./automation-signals";
import { attemptsLabel, DeliveryIssueRow, deliveryKindLabel } from "./delivery-issue-row";
import { hasActivityLog } from "./automation-detail-frame";
import { PerformanceFigure, PeriodChangeNote } from "./performance-figures";
import { RangeSwitch } from "./range-switch";
import { SectionCard } from "./page-header";
import { Skeleton } from "./skeleton";
import { TopPosts, usePostMedia } from "./top-posts";
import { WindowTrendChart } from "./trend-chart";
import { RelativeTime } from "./ui/relative-time";
import { useRangePreference } from "./ui/use-range-preference";
import { relativeTimeLabel } from "./workspace-primitives";
import { StatusBadge, type StatusTone } from "./ui/status-badge";
import type { AutomationRecord, ParticipantState } from "@/src/lib/repository";
import { automationAttention, isFacebookAutomation, recentFailureCount } from "@/src/lib/automation-attention";
import {
  automationFigures,
  campaignFunnel,
  isCampaign,
  normalizeAutomationAnalytics,
  type AutomationAnalytics,
  type AutomationFigures,
} from "@/src/lib/automation-analytics";
import type { AnalyticsRange } from "@/src/lib/analytics-range";
import { formatDateTime } from "@/src/lib/format-date";

const RECENT_COUNT = 5;

/** Where this browser remembers the 7 / 14 / 30-day choice for automation analytics. */
export const AUTOMATION_RANGE_KEY = "linkar.automation.range";

type ActivityRow = { id: string; who: string; what: string; tone: StatusTone; outcome: string; at: string };

const STATE_OUTCOME: Record<ParticipantState, [StatusTone, string]> = {
  COMMENT_MATCHED: ["neutral", "Commented"],
  OPENING_SENT: ["neutral", "Got the DM"],
  OPTED_IN: ["neutral", "Tapped the button"],
  FOLLOW_REQUIRED: ["neutral", "Asked to follow"],
  FOLLOW_VERIFIED: ["neutral", "Followed"],
  LINK_SENT: ["success", "Got the link"],
  EXPIRED: ["neutral", "Stopped replying"],
  FAILED: ["danger", "Failed"],
};

const FACEBOOK_OUTCOME: Record<string, [StatusTone, string]> = {
  SENT: ["success", "Replied"],
  SKIPPED: ["neutral", "Skipped"],
  FAILED: ["danger", "Failed"],
  PROCESSING: ["neutral", "Sending"],
};

type ActivityPayload = {
  data?: Array<{
    id: string;
    createdAt: string;
    // Instagram campaign participants
    instagramUsername?: string;
    matchedKeyword?: string;
    state?: ParticipantState;
    // Facebook Page comments
    authorName?: string;
    commentPreview?: string;
    result?: string;
  }>;
};

/** The newest few people this automation answered, from the Activity tab's own feed. */
export function recentActivityRows(payload: ActivityPayload, facebook: boolean): ActivityRow[] {
  return (payload.data ?? [])
    .slice()
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, RECENT_COUNT)
    .map((row): ActivityRow => {
      if (facebook) {
        const [tone, outcome]: [StatusTone, string] = FACEBOOK_OUTCOME[row.result ?? ""] ?? ["neutral", "Seen"];
        return {
          id: row.id,
          who: row.authorName?.trim() || "Someone",
          what: row.commentPreview ? `“${row.commentPreview}”` : "commented",
          tone,
          outcome,
          at: row.createdAt,
        };
      }
      const [tone, outcome]: [StatusTone, string] = row.state ? STATE_OUTCOME[row.state] ?? ["neutral", "In progress"] : ["neutral", "In progress"];
      return {
        id: row.id,
        who: row.instagramUsername ? `@${row.instagramUsername}` : "Someone",
        what: row.matchedKeyword ? `commented “${row.matchedKeyword}”` : "commented",
        tone,
        outcome,
        at: row.createdAt,
      };
    });
}

// Stale-while-revalidate per automation and window, like Insights: switching
// back to a window already seen paints its numbers at once.
const ANALYTICS_FRESH_FOR_MS = 60_000;
const analyticsCache = new Map<string, { value: AutomationAnalytics; fetchedAt: number; fetcher: typeof fetch }>();

function readAnalyticsCache(key: string) {
  const entry = analyticsCache.get(key);
  return entry && entry.fetcher === fetch ? entry : undefined;
}

export function automationAnalyticsUrl(automationId: string, days: AnalyticsRange): string {
  return `/api/insights?include=automation&automationId=${encodeURIComponent(automationId)}&days=${days}`;
}

type AnalyticsState = {
  /** The numbers on screen and the window they describe; trails `range` while a new window loads. */
  shown: { days: AnalyticsRange; data: AutomationAnalytics } | null;
  /** The window whose request failed, if the latest one did. */
  failed: AnalyticsRange | null;
};

function useAutomationAnalytics(automationId: string, range: AnalyticsRange, ready: boolean) {
  const [state, setState] = useState<AnalyticsState>({ shown: null, failed: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const key = `${automationId}|${range}`;
    const controller = new AbortController();
    // Deferred a tick so the cached paint and the request share one path
    // (and no state is set synchronously inside the effect).
    const timer = window.setTimeout(() => {
      const cached = readAnalyticsCache(key);
      if (cached) {
        setState({ shown: { days: range, data: cached.value }, failed: null });
        if (Date.now() - cached.fetchedAt < ANALYTICS_FRESH_FOR_MS) return;
      }
      fetch(automationAnalyticsUrl(automationId, range), { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Numbers unavailable");
          const data = normalizeAutomationAnalytics((await response.json()) as Partial<AutomationAnalytics>, range);
          analyticsCache.set(key, { value: data, fetchedAt: Date.now(), fetcher: fetch });
          setState({ shown: { days: range, data }, failed: null });
        })
        .catch(() => {
          if (!controller.signal.aborted) setState((current) => ({ shown: current.shown, failed: range }));
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [automationId, range, ready, attempt]);
  return { ...state, retry: () => setAttempt((value) => value + 1) };
}

function useRecentActivity(automation: AutomationRecord, enabled: boolean): ActivityRow[] | null {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  const facebook = isFacebookAutomation(automation);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetch(`/api/automations/${encodeURIComponent(automation.id)}/activity`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Activity unavailable");
        setRows(recentActivityRows((await response.json()) as ActivityPayload, facebook));
      })
      .catch(() => {
        if (!controller.signal.aborted) setRows([]);
      });
    return () => controller.abort();
  }, [automation.id, enabled, facebook]);
  return rows;
}

/** What this view will show once there is something to count, in this automation's terms. */
function emptyExplanation(automation: AutomationRecord, campaign: boolean, days: number): { title: string; text: string } {
  const what = campaign
    ? "replies sent and people reached each day, how far people get from comment to link, and which posts bring them in"
    : "replies sent and people reached each day";
  if (automation.status === "DRAFT") {
    return { title: "No numbers yet", text: `Turn it on and this fills in from the first matching comment or message: ${what}.` };
  }
  if (automation.status === "PAUSED") {
    return { title: `Nothing in the last ${days} days`, text: `It’s paused, so nothing new comes in. Once it’s on, this shows ${what}.` };
  }
  return { title: `Nothing in the last ${days} days yet`, text: `This shows ${what}, starting a minute or so after the first matching comment or message.` };
}

function FiguresRow({ figures, facebook }: { figures: AutomationFigures; facebook: boolean }) {
  const { days, previous } = figures;
  return (
    <div className="perf-figures auto-figures" role="list" aria-label="Key numbers">
      <PerformanceFigure value={figures.sent} label="Replies sent" tone="primary" change={<PeriodChangeNote current={figures.sent} previous={previous.sent} days={days} />} />
      <PerformanceFigure value={figures.reached} label={facebook ? "Comments answered" : "People reached"} tone="secondary" change={<PeriodChangeNote current={figures.reached} previous={previous.reached} days={days} />} />
      {figures.clicks !== null ? (
        <PerformanceFigure value={figures.clicks} label="Link clicks" tone="plain" change={<PeriodChangeNote current={figures.clicks} previous={previous.clicks} days={days} />} />
      ) : null}
      {figures.failed > 0 ? (
        <div className="perf-figure is-plain auto-figure-failed" role="listitem">
          <span className="perf-figure-value">{figures.failed.toLocaleString("en-IN")}</span>
          <span className="perf-figure-label"><i className="auto-warning-dot" aria-hidden />Failed deliveries</span>
          <span className="perf-figure-note"><a className="text-link" href="#automation-problems">Fix</a></span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Overview tab, read as one analytics view: the 7 / 14 / 30-day key
 * numbers and trend (the same figures and chart as Home), the funnel and top
 * posts for comment-to-link campaigns, the newest people it answered, its
 * delivery issues, and how it works as a quiet side panel. Built from APIs
 * the app already has: /api/insights?include=automation, the deliveries list
 * and the Activity feed.
 */
export function AutomationOverview({ automation, basePath = "/automations", initialRange }: {
  automation: AutomationRecord;
  basePath?: string;
  /** `?range=` as the server read it. */
  initialRange?: AnalyticsRange | null;
}) {
  const { range, setRange, ready } = useRangePreference(AUTOMATION_RANGE_KEY, initialRange);
  const analytics = useAutomationAnalytics(automation.id, range, ready);
  const connections = useWorkspaceConnections();
  const problems = useDeliveryProblems();
  const facebook = isFacebookAutomation(automation);
  const campaign = isCampaign(automation);
  const withActivity = hasActivityLog(automation);
  const recent = useRecentActivity(automation, withActivity);
  const href = `${basePath}/${encodeURIComponent(automation.id)}`;

  const attention = automationAttention(automation, {
    instagram: connections?.instagram ?? null,
    facebook: connections?.facebook ?? null,
    failures: problems,
  });
  const failures = (problems ?? []).filter((problem) => problem.automationId === automation.id);
  const recentFailures = recentFailureCount(automation.id, problems);
  const accountName = connections?.instagram.find((account) => account.igUserId === automation.instagramAccountId)?.username
    ?? (connections?.instagram.length === 1 && !automation.instagramAccountId ? connections.instagram[0].username : undefined);
  const pageName = connections?.facebook.find((page) => page.pageId === automation.facebookPageId)?.pageName;

  const shown = analytics.shown;
  const figures = shown ? automationFigures(shown.data, campaign) : null;
  const shownDays = shown?.days ?? range;
  const switchFailed = shown !== null && analytics.failed === range && shown.days !== range;
  const pending = shown !== null && shown.days !== range && !switchFailed;
  const funnel = shown && figures && !figures.empty ? campaignFunnel(automation, shown.data.journey, shown.data.clicks) : null;
  const posts = shown && campaign && figures && !figures.empty ? shown.data.mediaPerformance : [];
  const ownAutomation = useMemo(() => [automation], [automation]);
  const media = usePostMedia(ownAutomation, posts.length > 0);
  const empty = figures?.empty ? emptyExplanation(automation, campaign, shownDays) : null;

  return (
    <div className="auto-overview">
      {attention ? (
        <div className={`auto-attention is-${attention.tone}`} role="status">
          <StatusBadge tone={attention.tone} label={attention.chip} />
          <p>{attention.text}</p>
          {attention.reason === "failures" ? (
            <a className="button button-secondary button-small" href="#automation-problems">Review</a>
          ) : (
            <Link className="button button-secondary button-small" href="/settings">{attention.actionLabel}</Link>
          )}
        </div>
      ) : null}

      <section className="surface auto-analytics" aria-labelledby="automation-numbers" aria-busy={pending || !shown || undefined} data-pending={pending ? "" : undefined}>
        <div className="auto-analytics-head">
          <h2 id="automation-numbers">Last {range} days</h2>
          <RangeSwitch value={range} onChange={setRange} className="auto-analytics-range" />
        </div>
        {switchFailed ? (
          <div className="home-range-error" role="alert">
            <p>The last {range} days didn’t load. These are the last {shownDays} days.</p>
            <button className="button button-secondary button-small" type="button" onClick={analytics.retry}><RefreshCw size={15} aria-hidden /> Try again</button>
          </div>
        ) : null}
        {!shown && analytics.failed !== null ? (
          <div className="chart-state auto-analytics-state" role="alert">
            <p>The numbers didn’t load. Check your connection and try again.</p>
            <button className="button button-secondary button-small" type="button" onClick={analytics.retry}><RefreshCw size={15} aria-hidden /> Try again</button>
          </div>
        ) : !shown || !figures ? (
          <>
            <div className="perf-figures auto-figures" role="list" aria-label="Loading key numbers">
              <div className="perf-figure" role="listitem"><Skeleton className="perf-figure-skeleton" /><span className="perf-figure-label">Replies sent</span></div>
              <div className="perf-figure" role="listitem"><Skeleton className="perf-figure-skeleton" /><span className="perf-figure-label">{facebook ? "Comments answered" : "People reached"}</span></div>
            </div>
            <Skeleton className="home-chart-skeleton" />
          </>
        ) : empty ? (
          <div className="auto-analytics-empty">
            <h3>{empty.title}</h3>
            <p>{empty.text}</p>
            {automation.status === "DRAFT" ? <Link className="button button-secondary button-small" href={`${href}/edit`}>Review and turn on</Link> : null}
          </div>
        ) : (
          <>
            <FiguresRow figures={figures} facebook={facebook} />
            {figures.sent > 0 || figures.reached > 0 ? (
              <WindowTrendChart
                days={shownDays}
                sentPerDay={shown.data.timeseries.sentPerDay}
                reachedPerDay={shown.data.timeseries.participantsPerDay}
                reachedLabel={facebook ? "comments answered" : "people reached"}
              />
            ) : (
              <div className="chart-state auto-analytics-state">
                <p>No replies in the last {shownDays} days. The daily line starts again with the next one.</p>
              </div>
            )}
          </>
        )}
      </section>

      {funnel ? (
        <div className="auto-analytics-grid">
          <SectionCard
            className="auto-funnel-card"
            aria-label="From comment to link"
            title="From comment to link"
            description={`People who commented in the last ${shownDays} days, and how far they got.`}
          >
            {funnel[0].count > 0
              ? <AutomationFunnel steps={funnel} label="Steps from comment to link" />
              : <p className="ins-empty-copy">Nobody commented in the last {shownDays} days. Each step fills in as people do.</p>}
          </SectionCard>
          <SectionCard
            className="auto-posts-card"
            aria-label="Top posts"
            title="Top posts"
            description={`Posts with the most matched comments in the last ${shownDays} days.`}
          >
            <TopPosts posts={posts} media={media} showDelivered emptyText={`No comments matched on any post in the last ${shownDays} days.`} />
          </SectionCard>
        </div>
      ) : null}

      <div className="auto-overview-grid">
        <div className="auto-overview-main">
          {withActivity ? (
            <section className="surface auto-recent" aria-labelledby="automation-recent">
              <div className="surface-head">
                <div className="surface-head-copy"><h2 id="automation-recent">Recent activity</h2></div>
                <div className="surface-head-action"><Link className="text-link" href={`${href}/activity`}>View all activity</Link></div>
              </div>
              <div className="surface-body">
                {recent === null ? (
                  <ul className="auto-recent-list" aria-busy="true" aria-label="Loading recent activity">
                    {[0, 1, 2].map((index) => <li key={index}><span className="skeleton-block auto-recent-skeleton" /></li>)}
                  </ul>
                ) : recent.length === 0 ? (
                  <p className="auto-quiet">Nobody has triggered it yet. The people it answers show up here, newest first.</p>
                ) : (
                  <ul className="auto-recent-list">
                    {recent.map((row) => (
                      <li key={row.id}>
                        <p className="auto-recent-who"><strong>{row.who}</strong> <span>{row.what}</span></p>
                        <p className="auto-recent-meta">
                          <StatusBadge tone={row.tone} label={row.outcome} />
                          <RelativeTime value={row.at} />
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ) : null}

          <section className="surface auto-problems" id="automation-problems" aria-labelledby="automation-problems-title">
            <div className="surface-head">
              <div className="surface-head-copy"><h2 id="automation-problems-title">Delivery issues</h2></div>
            </div>
            <div className="surface-body">
              {problems === null ? (
                <span className="skeleton-block auto-recent-skeleton" aria-label="Loading delivery issues" />
              ) : failures.length === 0 ? (
                <p className="auto-quiet is-ok"><Check size={15} aria-hidden /> No messages waiting on a retry.</p>
              ) : (
                <>
                  {recentFailures === 0 ? <p className="auto-quiet">None in the last 7 days. Older ones are below.</p> : null}
                  <ul className="failure-list">
                    {failures.slice(0, RECENT_COUNT).map((problem, index) => (
                      <DeliveryIssueRow
                        key={`${problem.kind}:${problem.updatedAt}:${index}`}
                        label={deliveryKindLabel(problem.kind)}
                        lastError={problem.lastError}
                        detail={attemptsLabel(problem.attemptCount)}
                        timestamp={problem.updatedAt}
                        timeLabel={relativeTimeLabel(problem.updatedAt)}
                        timeTitle={formatDateTime(problem.updatedAt)}
                        state={problem.state}
                        stateLabel={problem.state === "UNKNOWN" ? "Needs review" : "Retry pending"}
                      />
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        </div>

        <section className="surface auto-setup" aria-labelledby="automation-what">
          <div className="surface-head">
            <div className="surface-head-copy">
              <h2 id="automation-what">How it works</h2>
            </div>
            <div className="surface-head-action">
              <Link className="text-link" href={`${href}/edit`}>Change it</Link>
            </div>
          </div>
          <div className="surface-body">
            <AutomationSummary automation={automation} accountName={accountName} pageName={pageName} />
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * The Overview route's client half: uses the automation the server already
 * read, or fetches it when that lookup failed.
 */
export function AutomationOverviewScreen({ automationId, initialAutomation, basePath = "/automations", initialRange }: {
  automationId: string;
  initialAutomation?: AutomationRecord;
  basePath?: string;
  initialRange?: AnalyticsRange | null;
}) {
  const [automation, setAutomation] = useState<AutomationRecord | null>(initialAutomation ?? null);
  const [failed, setFailed] = useState<"missing" | "failed" | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (initialAutomation) return;
    const controller = new AbortController();
    fetch(`/api/automations/${encodeURIComponent(automationId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setFailed("missing");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as { data?: AutomationRecord };
        if (!response.ok || !payload.data) throw new Error("Could not load this automation");
        setAutomation(payload.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed("failed");
      });
    return () => controller.abort();
  }, [automationId, initialAutomation, attempt]);

  if (automation) return <AutomationOverview automation={automation} basePath={basePath} initialRange={initialRange} />;
  if (failed === "missing") {
    return (
      <section className="surface auto-load-error" role="alert">
        <h2>This automation no longer exists</h2>
        <p>It may have been deleted by someone in your workspace.</p>
        <Link className="button button-secondary" href={basePath}>Back to automations</Link>
      </section>
    );
  }
  if (failed === "failed") {
    return (
      <section className="surface auto-load-error" role="alert">
        <h2>This automation couldn’t be opened</h2>
        <p>Linkar couldn’t load it just now. Nothing has changed, so try again in a moment.</p>
        <button type="button" className="button button-primary" onClick={() => { setFailed(null); setAttempt((value) => value + 1); }}>
          <RefreshCw size={16} aria-hidden /> Try again
        </button>
      </section>
    );
  }
  return (
    <div className="auto-overview-loading" aria-busy="true" aria-label="Loading automation">
      <span className="skeleton-block auto-recent-skeleton" />
    </div>
  );
}
