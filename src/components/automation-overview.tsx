"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, RefreshCw } from "lucide-react";
import { AutomationSummary } from "./automation-summary";
import { useDeliveryProblems, useWorkspaceConnections } from "./automation-signals";
import { attemptsLabel, DeliveryIssueRow, deliveryKindLabel } from "./delivery-issue-row";
import { hasActivityLog } from "./automation-detail-frame";
import { RelativeTime } from "./ui/relative-time";
import { relativeTimeLabel } from "./workspace-primitives";
import { StatusBadge, type StatusTone } from "./ui/status-badge";
import { slidingThumbRef } from "./ui/use-sliding-thumb";
import type { AutomationRecord, ParticipantState } from "@/src/lib/repository";
import { automationAttention, isFacebookAutomation, recentFailureCount } from "@/src/lib/automation-attention";
import { formatDateTime } from "@/src/lib/format-date";

const RANGES = [7, 14, 30] as const;
type Range = (typeof RANGES)[number];
const RECENT_COUNT = 5;

type DayPoint = { day: string; count: number };
type InsightsPayload = {
  timeseries?: { days?: number; participantsPerDay?: DayPoint[]; sentPerDay?: DayPoint[] };
  previous?: { sent?: number; reached?: number };
  automations?: Array<{ automationId: string; sent: number; failed: number; skipped: number }>;
};

export type OverviewNumbers = { days: number; sent: number; reached: number; failed: number; previousSent: number };

function sum(points: DayPoint[] | undefined): number {
  return (points ?? []).reduce((total, point) => total + point.count, 0);
}

export function overviewNumbers(payload: InsightsPayload, automationId: string, days: number): OverviewNumbers {
  const outcome = payload.automations?.find((row) => row.automationId === automationId);
  return {
    days: payload.timeseries?.days ?? days,
    sent: sum(payload.timeseries?.sentPerDay),
    reached: sum(payload.timeseries?.participantsPerDay),
    failed: outcome?.failed ?? 0,
    previousSent: payload.previous?.sent ?? 0,
  };
}

/** "Up 18% on the previous 7 days", in the words Home and Insights use. */
export function comparisonSentence({ sent, previousSent, days }: OverviewNumbers): string | null {
  if (sent === 0 && previousSent === 0) return null;
  if (previousSent === 0) return `No replies in the ${days} days before, so this is a fresh start.`;
  const change = Math.round(((sent - previousSent) / previousSent) * 100);
  if (change === 0) return `Level with the previous ${days} days.`;
  return `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% on the previous ${days} days.`;
}

function count(value: number): string {
  return value.toLocaleString("en-IN");
}

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

function useOverviewNumbers(automationId: string, days: Range) {
  const [state, setState] = useState<{ days: Range; numbers: OverviewNumbers | null; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/insights?automationId=${encodeURIComponent(automationId)}&days=${days}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Numbers unavailable");
        const payload = (await response.json()) as InsightsPayload;
        setState({ days, numbers: overviewNumbers(payload, automationId, days), error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState((current) => ({ days, numbers: current?.numbers ?? null, error: true }));
      });
    return () => controller.abort();
  }, [automationId, days, attempt]);
  return { state, retry: () => setAttempt((value) => value + 1) };
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

/**
 * The Overview tab: whether it needs you, what it does (the builder's review
 * story), how it did over the last 7 / 14 / 30 days, and the latest people it
 * answered and messages that failed. Built only from APIs the app already
 * has: /api/insights?automationId=, the deliveries list and the Activity feed.
 */
export function AutomationOverview({ automation, basePath = "/automations" }: { automation: AutomationRecord; basePath?: string }) {
  const [range, setRange] = useState<Range>(7);
  const { state: numbersState, retry } = useOverviewNumbers(automation.id, range);
  const connections = useWorkspaceConnections();
  const problems = useDeliveryProblems();
  const facebook = isFacebookAutomation(automation);
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
  const numbers = numbersState?.numbers ?? null;
  const shownDays = numbers?.days ?? range;
  const comparison = numbers ? comparisonSentence(numbers) : null;

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

      <div className="auto-overview-grid">
        <section className="surface auto-overview-story" aria-labelledby="automation-what">
          <div className="surface-head">
            <div className="surface-head-copy">
              <h2 id="automation-what">What it does</h2>
            </div>
            <div className="surface-head-action">
              <Link className="text-link" href={`${href}/edit`}>Change it</Link>
            </div>
          </div>
          <div className="surface-body">
            <AutomationSummary automation={automation} accountName={accountName} pageName={pageName} />
          </div>
        </section>

        <div className="auto-overview-side">
          <section className="surface auto-numbers" aria-labelledby="automation-numbers">
            <div className="auto-numbers-head">
              <h2 id="automation-numbers">Last {shownDays} days</h2>
              <div ref={slidingThumbRef} className="segmented auto-range" role="group" aria-label="Time range">
                {RANGES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={`segmented-option ${range === option ? "is-on" : ""}`}
                    aria-pressed={range === option}
                    onClick={() => setRange(option)}
                  >
                    {option} days
                  </button>
                ))}
              </div>
            </div>
            {numbersState?.error && !numbers ? (
              <div className="auto-numbers-error" role="alert">
                <p>The numbers didn’t load.</p>
                <button className="button button-secondary button-small" type="button" onClick={retry}><RefreshCw size={15} aria-hidden /> Try again</button>
              </div>
            ) : (
              <dl className="auto-numbers-list" aria-busy={!numbers || numbersState?.days !== range}>
                <div>
                  <dt>Replies sent</dt>
                  <dd>{numbers ? count(numbers.sent) : <span className="skeleton-block auto-number-skeleton" />}</dd>
                </div>
                <div>
                  <dt>{facebook ? "Comments answered" : "People reached"}</dt>
                  <dd>{numbers ? count(numbers.reached) : <span className="skeleton-block auto-number-skeleton" />}</dd>
                </div>
                <div>
                  <dt>Couldn’t send</dt>
                  <dd data-tone={numbers && numbers.failed > 0 ? "warning" : undefined}>{numbers ? count(numbers.failed) : <span className="skeleton-block auto-number-skeleton" />}</dd>
                </div>
              </dl>
            )}
            {numbers ? (
              <p className="auto-numbers-note">
                {comparison ?? (automation.status === "DRAFT" ? "Turn it on and replies start counting here." : `No replies in the last ${shownDays} days yet.`)}
              </p>
            ) : null}
          </section>

          {withActivity ? (
            <section className="surface auto-recent" aria-labelledby="automation-recent">
              <div className="surface-head">
                <div className="surface-head-copy"><h2 id="automation-recent">Latest replies</h2></div>
                <div className="surface-head-action"><Link className="text-link" href={`${href}/activity`}>See all activity</Link></div>
              </div>
              <div className="surface-body">
                {recent === null ? (
                  <ul className="auto-recent-list" aria-busy="true" aria-label="Loading latest replies">
                    {[0, 1, 2].map((index) => <li key={index}><span className="skeleton-block auto-recent-skeleton" /></li>)}
                  </ul>
                ) : recent.length === 0 ? (
                  <p className="auto-quiet">Nobody has triggered it yet. People it answers show up here.</p>
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
      </div>
    </div>
  );
}

/**
 * The Overview route's client half: uses the automation the server already
 * read, or fetches it when that lookup failed.
 */
export function AutomationOverviewScreen({ automationId, initialAutomation, basePath = "/automations" }: {
  automationId: string;
  initialAutomation?: AutomationRecord;
  basePath?: string;
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

  if (automation) return <AutomationOverview automation={automation} basePath={basePath} />;
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
