"use client";

import {
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  Link2,
  MessageCircle,
  MousePointerClick,
  Minus,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CampaignPerformanceSkeleton } from "./skeleton";
import { SectionCard } from "./page-header";
import { StatGrid, StatTile } from "./stat-tile";
import type { ParticipantState } from "@/src/lib/repository";
import { formatDateTime, formatRelativeTime } from "@/src/lib/format-date";
import {
  FOLLOWED_STATES,
  OPTED_IN_OR_LATER_STATES,
  type ParticipantActivitySummary,
  type ParticipantFunnelSummary,
} from "@/src/lib/automation/activity-summary";

export type { ParticipantActivitySummary, ParticipantFunnelSummary };

export type FacebookPageActivitySummary = {
  id: string;
  provider: "FACEBOOK";
  surface: "COMMENT";
  connectionName: string;
  eventType: "comment.created";
  result: "PROCESSING" | "SENT" | "SKIPPED" | "FAILED";
  authorName?: string;
  commentPreview?: string;
  safeErrorCode?: string;
  replyPreview?: string;
  createdAt: string;
};

const FUNNEL_STAGES: { key: keyof ParticipantFunnelSummary; label: string }[] = [
  { key: "commented", label: "Commented" },
  { key: "openingSent", label: "Got the DM" },
  { key: "optedIn", label: "Opted in" },
  { key: "followed", label: "Followed" },
  { key: "linkSent", label: "Got the link" },
];

const JOURNEY_STEPS = ["Comment", "DM", "Opt-in", "Follow", "Link"] as const;

const IN_PROGRESS_STATES = new Set<ParticipantState>([
  "COMMENT_MATCHED",
  "OPENING_SENT",
  "OPTED_IN",
  "FOLLOW_REQUIRED",
  "FOLLOW_VERIFIED",
]);

type FeedFilter = "all" | "progress" | "delivered" | "attention";

const FEED_FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "progress", label: "In progress" },
  { key: "delivered", label: "Delivered" },
  { key: "attention", label: "Needs attention" },
];

function formatTimestamp(value?: string): string {
  if (!value) return "not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "not yet" : formatDateTime(date);
}

function participantStateLabel(state: ParticipantState): string {
  return state.toLowerCase().replaceAll("_", " ");
}

function hasRecordedError(participant: ParticipantActivitySummary): boolean {
  return Boolean(participant.publicReplyError || participant.openingError || participant.finalDeliveryError);
}

function matchesFeedFilter(participant: ParticipantActivitySummary, filter: FeedFilter): boolean {
  if (filter === "progress") return IN_PROGRESS_STATES.has(participant.state);
  if (filter === "delivered") return participant.finalDeliveryStatus === "SENT";
  if (filter === "attention") {
    return participant.state === "FAILED" || participant.state === "EXPIRED" || hasRecordedError(participant);
  }
  return true;
}

function matchesSearch(participant: ParticipantActivitySummary, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    participant.matchedKeyword ?? "",
    participant.instagramUsername ?? "",
    participant.sourceMediaSnapshot.caption ?? "",
    participantStateLabel(participant.state),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

type JourneyStepState = "done" | "current" | "failed" | "expired" | "upcoming";

function journeyStepStates(participant: ParticipantActivitySummary): JourneyStepState[] {
  const done = [
    true,
    participant.openingStatus === "SENT",
    OPTED_IN_OR_LATER_STATES.has(participant.state),
    participant.followStatus === true || FOLLOWED_STATES.has(participant.state),
    participant.finalDeliveryStatus === "SENT",
  ];
  let current = done.findIndex((step) => !step);
  if (current === -1) current = done.length - 1;
  const terminal: "failed" | "expired" | null =
    participant.state === "FAILED" ? "failed" : participant.state === "EXPIRED" ? "expired" : null;
  return done.map((complete, index) => {
    if (complete) return "done";
    if (index === current && terminal) return terminal;
    if (index === current) return "current";
    return "upcoming";
  });
}

type Tone = "ok" | "bad" | "wait" | "skip";

const TONE_ICONS: Record<Tone, typeof Check> = { ok: Check, bad: X, wait: Clock, skip: Minus };

function statusTone(status?: string): Tone {
  switch ((status ?? "").toUpperCase()) {
    case "SENT":
    case "DELIVERED":
      return "ok";
    case "FAILED":
      return "bad";
    case "SKIPPED":
    case "SUPPRESSED":
    case "WINDOW_CLOSED":
      return "skip";
    default:
      return "wait";
  }
}

function followSummary(participant: ParticipantActivitySummary): string {
  if (participant.followStatus === true) return `Following · checked ${formatTimestamp(participant.followCheckedAt)}`;
  if (participant.followStatus === false) return `Not following yet · checked ${formatTimestamp(participant.followCheckedAt)}`;
  return "Not checked yet";
}

function statusBadgeLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function deliveryLabel(participant: ParticipantActivitySummary): string {
  if (participant.finalDeliveryStatus === "SENT") {
    return participant.finalDeliveredAt ? `Delivered ${formatRelativeTime(participant.finalDeliveredAt)}` : "Delivered";
  }
  if (participant.finalDeliveryStatus === "FAILED" || participant.state === "FAILED") return "Needs a retry";
  if (participant.state === "EXPIRED") return "Window closed";
  if (["SKIPPED", "SUPPRESSED", "WINDOW_CLOSED"].includes(participant.finalDeliveryStatus)) return "Skipped";
  return "In progress";
}

function ParticipantStateBadge({ state }: { state: ParticipantState }) {
  return <span className={`status-badge status-${state.toLowerCase()}`}>{participantStateLabel(state)}</span>;
}

function Diagnostic({ label, tone, detail }: { label: string; tone: Tone; detail: string }) {
  const Icon = TONE_ICONS[tone];
  return (
    <div className={`diagnostic tone-${tone}`}>
      <dt>
        <span className="diagnostic-icon" aria-hidden><Icon size={12} strokeWidth={2.6} /></span>
        {label}
      </dt>
      <dd>{detail}</dd>
    </div>
  );
}

function FunnelChart({ summary }: { summary: ParticipantFunnelSummary }) {
  const total = Math.max(1, summary.commented);
  // The stage that loses the largest share of the previous stage is where to
  // look first, so it gets called out instead of making the reader compare.
  let worst = -1;
  let worstRate = 101;
  FUNNEL_STAGES.forEach((stage, index) => {
    if (index === 0) return;
    const previous = summary[FUNNEL_STAGES[index - 1].key];
    if (previous <= 0) return;
    const rate = (summary[stage.key] / previous) * 100;
    if (rate < worstRate) {
      worstRate = rate;
      worst = index;
    }
  });
  return (
    <SectionCard
      className="campaign-funnel"
      title="Conversion funnel"
      description="Share of commenters who reached each stage."
      aria-label="Campaign funnel"
    >
      <ol className="funnel-bars">
        {FUNNEL_STAGES.map((stage, index) => {
          const count = summary[stage.key];
          const reach = Math.round((count / total) * 100);
          const previous = index > 0 ? summary[FUNNEL_STAGES[index - 1].key] : null;
          const conversion = previous && previous > 0 ? Math.round((count / previous) * 100) : null;
          return (
            <li className={`funnel-bar-row${index === worst && worstRate < 90 ? " is-worst" : ""}`} key={stage.key}>
              <span className="funnel-bar-label">{stage.label}</span>
              <span className="funnel-bar-track" aria-hidden><span style={{ width: `${Math.max(reach, count > 0 ? 1 : 0)}%` }} /></span>
              <strong className="funnel-bar-count">{count.toLocaleString()}</strong>
              <span className="funnel-bar-rate">
                {conversion === null ? `${reach}%` : (
                  <span className={`funnel-conv${conversion < 50 ? " is-low" : ""}`} title={`Converted from ${FUNNEL_STAGES[index - 1].label.toLowerCase()}`}>
                    {conversion}%
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {worst > 0 && worstRate < 90 ? (
        <p className="funnel-callout">
          Biggest drop: <strong>{FUNNEL_STAGES[worst - 1].label}</strong> → <strong>{FUNNEL_STAGES[worst].label}</strong> ({Math.round(worstRate)}% continue)
        </p>
      ) : null}
    </SectionCard>
  );
}

function CampaignKpis({ summary, clicks, attention, loaded }: {
  summary: ParticipantFunnelSummary;
  clicks: { delivered: number; clicked: number; rate: number };
  attention: number;
  loaded: number;
}) {
  const deliveredRate = summary.commented > 0 ? Math.round((summary.linkSent / summary.commented) * 100) : 0;
  return (
    <StatGrid label="Campaign summary" className="campaign-kpis">
      <StatTile label="Commented" icon={MessageCircle} value={summary.commented} note="People who matched the trigger" />
      <StatTile label="Links delivered" icon={Link2} value={summary.linkSent} note={`${deliveredRate}% of commenters`} />
      <StatTile
        label="Link clicks"
        icon={MousePointerClick}
        value={clicks.delivered > 0 ? `${clicks.rate}%` : "–"}
        note={clicks.delivered > 0 ? `${clicks.clicked} of ${clicks.delivered} recent deliveries` : "No recent deliveries yet"}
      />
      <StatTile label="Needs attention" icon={AlertTriangle} value={attention} note={`In the latest ${loaded.toLocaleString()}`} />
    </StatGrid>
  );
}

function JourneyTrack({ participant }: { participant: ParticipantActivitySummary }) {
  const states = journeyStepStates(participant);
  // Five segments show how far they got; one line names where they are.
  const stalledAt = states.findIndex((state) => state !== "done");
  const caption = stalledAt === -1 ? "Complete" : JOURNEY_STEPS[stalledAt];
  const stopped = participant.state === "FAILED" || participant.state === "EXPIRED";
  return (
    <div className="journey-cell">
      <ol className="journey-steps" aria-label="Participant journey">
        {JOURNEY_STEPS.map((label, index) => (
          <li key={label} className={`is-${states[index]}`} title={label}>
            <span className="journey-label sr-only">{label}</span>
          </li>
        ))}
      </ol>
      <span className="journey-meta">
        {stalledAt === -1 ? null : <span className="journey-prefix">{stopped ? "Stopped at" : "Waiting on"} </span>}
        <span className={`journey-caption${stalledAt === -1 ? " is-complete" : ""}`}>{caption}</span>
      </span>
    </div>
  );
}

function ParticipantIdentity({ participant }: { participant: ParticipantActivitySummary }) {
  const username = participant.instagramUsername?.trim().replace(/^@+/, "");
  const meta = [
    participant.createdAt ? formatRelativeTime(participant.createdAt) : "",
    participant.variantLabel ? `Variant ${participant.variantLabel}` : "",
  ].filter(Boolean);
  return (
    <div className="row-identity">
      <span className="participant-initial" aria-hidden>{(username ?? "?").slice(0, 1).toUpperCase()}</span>
      <div className="participant-copy">
        <span className="participant-handle">{username ? `@${username}` : "Instagram user"}</span>
        <span className="participant-meta">
          {meta.map((item, index) => (
            <span key={item}>
              {index === 0 && participant.createdAt ? (
                <time dateTime={participant.createdAt} title={formatDateTime(participant.createdAt)}>{item}</time>
              ) : item}
            </span>
          ))}
          {participant.matchedKeyword ? <span className="participant-keyword">“{participant.matchedKeyword}”</span> : null}
        </span>
      </div>
    </div>
  );
}

function ActivityRow({
  participant,
  onRetry,
  retrying,
}: {
  participant: ParticipantActivitySummary;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const media = participant.sourceMediaSnapshot;
  const publicReplyDetail = `${statusBadgeLabel(participant.publicReplyStatus)}${participant.publicReplyError ? ` - ${participant.publicReplyError}` : ""}`;
  const openingDetail = `${statusBadgeLabel(participant.openingStatus)}${participant.openingError ? ` - ${participant.openingError}` : ""}`;
  const deliveryDetail = [
    `${statusBadgeLabel(participant.finalDeliveryStatus)}${participant.finalDeliveryError ? ` - ${participant.finalDeliveryError}` : ""}`,
    participant.finalDeliveredAt ? `Delivered ${formatTimestamp(participant.finalDeliveredAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const tone = participant.state === "FAILED" ? "bad"
    : participant.state === "EXPIRED" ? "skip"
    : participant.finalDeliveryStatus === "SENT" ? "ok" : "wait";

  return (
    <article className={`activity-row participant-row tone-${tone}`}>
      <div className="activity-row-grid">
        <ParticipantIdentity participant={participant} />
        <JourneyTrack participant={participant} />
        <div className="row-status">
          <ParticipantStateBadge state={participant.state} />
          <span className={`delivery-cell tone-${statusTone(participant.finalDeliveryStatus)}`}>
            {deliveryLabel(participant)}
          </span>
        </div>
        <div className="row-actions">
          {participant.state === "FAILED" && onRetry && (
            <button type="button" className="icon-button" onClick={onRetry} disabled={retrying} title="Retry delivery">
              <RotateCcw size={14} className={retrying ? "is-spinning" : undefined} />
              <span className="sr-only">{retrying ? "Retrying delivery" : "Retry delivery"}</span>
            </button>
          )}
          <a className="icon-button" href={media.permalink} target="_blank" rel="noreferrer" title="View on Instagram">
            <ExternalLink size={14} />
            <span className="sr-only">View on Instagram</span>
          </a>
        </div>
      </div>
      {/* The summary docks into the row's action column (CSS); the panel
          opens full width underneath. */}
      <details className="row-detail">
        <summary className="row-detail-toggle" title="Delivery details">
          <ChevronRight size={15} className="row-detail-chevron" aria-hidden="true" />
          <span className="sr-only">Delivery details</span>
        </summary>
        <dl className="activity-diagnostics">
          <Diagnostic label="Public reply" tone={statusTone(participant.publicReplyStatus)} detail={publicReplyDetail} />
          <Diagnostic label="Opening DM" tone={statusTone(participant.openingStatus)} detail={openingDetail} />
          <Diagnostic
            label="Follow check"
            tone={participant.followStatus === true ? "ok" : "wait"}
            detail={followSummary(participant)}
          />
          <Diagnostic label="Final delivery" tone={statusTone(participant.finalDeliveryStatus)} detail={deliveryDetail} />
        </dl>
      </details>
    </article>
  );
}

function ActivityTableHead() {
  return (
    <div className="activity-table-head" aria-hidden="true">
      <span>Participant</span>
      <span>Journey</span>
      <span>Status</span>
      <span className="col-actions" />
    </div>
  );
}

function FacebookPageActivityView({ activity }: { activity: FacebookPageActivitySummary[] }) {
  const [result, setResult] = useState("all");
  const connectionName = activity[0]?.connectionName ?? "Facebook Page";
  const visible = result === "all" ? activity : activity.filter((item) => item.result === result);
  const filters = [
    { key: "all", label: "All", count: activity.length },
    { key: "SENT", label: "Sent", count: activity.filter((item) => item.result === "SENT").length },
    { key: "SKIPPED", label: "Skipped", count: activity.filter((item) => item.result === "SKIPPED").length },
    { key: "FAILED", label: "Failed", count: activity.filter((item) => item.result === "FAILED").length },
  ];
  return (
    <div className="activity-list facebook-page-activity">
      <header className="facebook-activity-header">
        <div className="facebook-page-identity">
          <span className="facebook-page-mark" aria-hidden="true">f</span>
          <div><span className="eyebrow">Facebook page</span><strong>{connectionName}</strong></div>
        </div>
        <p>Public comment replies only. These replies do not open a Messenger conversation or grant messaging eligibility.</p>
      </header>
      <div className="segmented filter-chips facebook-result-filters" role="group" aria-label="Facebook Page activity filters">
        {filters.map((filter) => (
          <button
            className={`segmented-option filter-chip${result === filter.key ? " is-on" : ""}`}
            aria-pressed={result === filter.key}
            key={filter.key}
            onClick={() => setResult(filter.key)}
            type="button"
          >
            {filter.label}<span className="chip-count">{filter.count}</span>
          </button>
        ))}
      </div>
      {activity.length === 0 ? (
        <div className="empty-state"><span className="empty-icon"><Radio size={22} /></span><h3>No Page activity yet.</h3><p>New matching Page comments will appear here after Linkar evaluates them.</p></div>
      ) : visible.length === 0 ? (
        <p className="muted feed-empty">No Page replies match this result.</p>
      ) : (
        <div className="facebook-activity-table">
          <div className="facebook-activity-table-head" aria-hidden="true">
            <span>Commenter</span><span>Comment</span><span>Public reply</span><span>Result</span><span>Time</span>
          </div>
          {visible.map((item) => (
            <article className="facebook-activity-row" key={item.id}>
              <div className="facebook-commenter"><span className="facebook-person-mark" aria-hidden="true">{(item.authorName ?? "F").slice(0, 1)}</span><strong>{item.authorName ?? "Facebook user"}</strong></div>
              <p>{item.commentPreview ?? "Comment content unavailable"}</p>
              <p className="facebook-reply-preview">{item.replyPreview ?? "No reply sent"}</p>
              <div className="facebook-result-cell">
                <span className={`status-badge status-${item.result.toLowerCase()}`}>{statusBadgeLabel(item.result)}</span>
                {item.safeErrorCode && <small>{item.safeErrorCode.replaceAll("_", " ")}</small>}
              </div>
              <time dateTime={item.createdAt}>{formatRelativeTime(item.createdAt)}</time>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function AutomationActivity({ automationId, aside }: { automationId: string; aside?: ReactNode }) {
  const [participants, setParticipants] = useState<ParticipantActivitySummary[] | null>(null);
  const [facebookActivity, setFacebookActivity] = useState<FacebookPageActivitySummary[] | null>(null);
  const [summary, setSummary] = useState<ParticipantFunnelSummary | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [retryingId, setRetryingId] = useState("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(25);

  async function retryParticipant(participantId: string) {
    setRetryingId(participantId);
    setError("");
    try {
      const response = await fetch(`/api/automations/${automationId}/activity/retry`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ participantId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not retry the delivery");
      setReloadKey((key) => key + 1);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not retry the delivery");
    } finally {
      setRetryingId("");
    }
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    fetch(`/api/automations/${automationId}/activity`, { signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: ParticipantActivitySummary[] | FacebookPageActivitySummary[];
          channel?: { provider?: string; surface?: string };
          summary?: ParticipantFunnelSummary;
          needsProfileEnrichment?: boolean;
          error?: string;
        };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load activity");
        if (active) {
          if (payload.channel?.provider === "FACEBOOK") {
            setFacebookActivity(payload.data as FacebookPageActivitySummary[]);
            setParticipants([]);
            setSummary(null);
          } else {
            setParticipants(payload.data as ParticipantActivitySummary[]);
            setFacebookActivity(null);
            setSummary(payload.summary as ParticipantFunnelSummary ?? null);
          }
          setError("");
        }
        if (active && payload.needsProfileEnrichment) {
          void fetch(`/api/automations/${automationId}/activity?enrich=1`, { signal: controller.signal })
            .then(async (response) => response.ok ? response.json() as Promise<{ data?: ParticipantActivitySummary[] }> : null)
            .then((enriched) => {
              if (!active || !enriched?.data) return;
              const names = new Map(enriched.data.map((item) => [item.id, item.instagramUsername]));
              setParticipants((current) => current?.map((item) => ({
                ...item,
                ...(names.get(item.id) ? { instagramUsername: names.get(item.id) } : {}),
              })) ?? null);
            })
            .catch(() => {});
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load activity");
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [automationId, reloadKey]);

  const filtered = useMemo(
    () => (participants ?? []).filter((p) => matchesFeedFilter(p, feedFilter) && matchesSearch(p, query)),
    [participants, feedFilter, query],
  );

  const filterCounts = useMemo(() => {
    const list = participants ?? [];
    return {
      all: list.length,
      progress: list.filter((p) => matchesFeedFilter(p, "progress")).length,
      delivered: list.filter((p) => matchesFeedFilter(p, "delivered")).length,
      attention: list.filter((p) => matchesFeedFilter(p, "attention")).length,
    } satisfies Record<FeedFilter, number>;
  }, [participants]);

  const clickStats = useMemo(() => {
    const delivered = (participants ?? []).filter((p) => p.finalDeliveryStatus === "SENT");
    const clicked = delivered.filter((p) => p.deliveryClickedAt);
    const rate = delivered.length > 0 ? Math.round((clicked.length / delivered.length) * 100) : 0;
    return { delivered: delivered.length, clicked: clicked.length, rate };
  }, [participants]);

  // Everyone in a campaign usually commented on the same one or two Reels, so
  // repeating that Reel's caption on every participant row (previously: once
  // per row, up to 100 times) was the loudest thing on the page and drowned
  // out what actually differs between people. Group by source post instead -
  // the caption renders once per group, and each row can foreground who the
  // person is (a short id, when they showed up, their A/B variant) rather
  // than what they already told you at the top of the group.
  const visibleParticipants = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const groups = useMemo(() => {
    const order: string[] = [];
    const byMedia = new Map<string, ParticipantActivitySummary[]>();
    for (const p of visibleParticipants) {
      const key = p.sourceMediaSnapshot.id;
      if (!byMedia.has(key)) {
        order.push(key);
        byMedia.set(key, []);
      }
      byMedia.get(key)!.push(p);
    }
    return order.map((key) => {
      const rows = byMedia.get(key)!;
      return { key, media: rows[0].sourceMediaSnapshot, participants: rows };
    });
  }, [visibleParticipants]);

  if (error && !participants) return <p className="form-error" role="alert">{error}</p>;

  if (!participants) {
    return <CampaignPerformanceSkeleton />;
  }

  if (facebookActivity) return <FacebookPageActivityView activity={facebookActivity} />;

  if (participants.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><Radio size={22} /></span>
        <h3>No activity yet.</h3>
        <p>Once someone comments on your gated Reel, their journey will show up here.</p>
      </div>
    );
  }

  const isNarrowed = feedFilter !== "all" || query.trim().length > 0;

  const truncated = summary && summary.commented > participants.length;

  return (
    <div className="activity-list campaign-performance-view">
      {summary && <CampaignKpis summary={summary} clicks={clickStats} attention={filterCounts.attention} loaded={participants.length} />}

      {summary || aside ? (
        <div className={`campaign-overview${aside ? " has-aside" : ""}`}>
          {summary ? <FunnelChart summary={summary} /> : null}
          {aside ? <aside className="campaign-aside" aria-label="Campaign insights">{aside}</aside> : null}
        </div>
      ) : null}

      <SectionCard
        flush
        className="campaign-participants"
        title="Participants"
        description={truncated
          ? `Latest ${participants.length.toLocaleString()} of ${summary.commented.toLocaleString()}. Export CSV for the full history.`
          : "Everyone who matched this campaign, newest first."}
        action={(
          <button
            type="button"
            className="icon-button feed-refresh"
            onClick={() => {
              setRefreshing(true);
              setReloadKey((key) => key + 1);
            }}
            disabled={refreshing}
            aria-label="Refresh activity"
            title="Refresh"
          >
            <RefreshCw size={15} className={refreshing ? "is-spinning" : undefined} />
          </button>
        )}
      >
        <div className="list-toolbar">
          <div className="segmented filter-chips" role="group" aria-label="Filter by status">
            {FEED_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                className={`segmented-option filter-chip${feedFilter === filter.key ? " is-on" : ""}`}
                aria-pressed={feedFilter === filter.key}
                onClick={() => { setFeedFilter(filter.key); setVisibleCount(25); }}
              >
                {filter.label}
                <span className="chip-count">{filterCounts[filter.key]}</span>
              </button>
            ))}
          </div>
          <label className="list-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setVisibleCount(25); }}
              placeholder="Search handle, keyword or caption"
              aria-label="Search participants"
            />
          </label>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        {isNarrowed && (
          <p className="muted feed-count">
            Showing {filtered.length} of {participants.length} participant{participants.length === 1 ? "" : "s"}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="muted feed-empty">No participants match this view. Try a different filter or search.</p>
        ) : (
          <div className="activity-groups">
            <ActivityTableHead />
            {groups.map((group) => (
              <section className="activity-group" key={group.key} aria-label={group.media.caption || "Untitled Reel"}>
                <header className="activity-group-head">
                  <span className="media-type-label">{group.media.mediaProductType ?? group.media.mediaType}</span>
                  <p className="activity-caption">{group.media.caption || "Untitled Reel"}</p>
                  <span className="activity-group-count">
                    {group.participants.length} {group.participants.length === 1 ? "person" : "people"}
                  </span>
                </header>
                <div className="activity-roster">
                  {group.participants.map((participant) => (
                    <ActivityRow
                      key={participant.id}
                      participant={participant}
                      onRetry={() => void retryParticipant(participant.id)}
                      retrying={retryingId === participant.id}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        {filtered.length > visibleCount && <button className="list-toggle activity-show-more" type="button" onClick={() => setVisibleCount((count) => count + 25)}>Show 25 more participants</button>}
      </SectionCard>
    </div>
  );
}
