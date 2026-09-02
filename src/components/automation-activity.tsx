"use client";

import Link from "next/link";
import {
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  Minus,
  MousePointerClick,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { InlineContentSkeleton } from "./skeleton";
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

type CampaignContext = { id: string; name: string; status: string };

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
  if (participant.finalDeliveryStatus === "FAILED") return "Failed";
  if (["SKIPPED", "SUPPRESSED", "WINDOW_CLOSED"].includes(participant.finalDeliveryStatus)) return "Skipped";
  return "Pending";
}

function ParticipantStateBadge({ state }: { state: ParticipantState }) {
  return <span className={`status-badge status-${state.toLowerCase()}`}>{participantStateLabel(state)}</span>;
}

function Diagnostic({ label, tone, detail }: { label: string; tone: Tone; detail: string }) {
  const Icon = TONE_ICONS[tone];
  return (
    <div className={`diagnostic tone-${tone}`}>
      <dt>
        <Icon size={13} strokeWidth={2.4} /> {label}
      </dt>
      <dd>{detail}</dd>
    </div>
  );
}

function FunnelStrip({ summary }: { summary: ParticipantFunnelSummary }) {
  const total = Math.max(1, summary.commented);
  return (
    <div className="funnel-strip" aria-label="Campaign funnel">
      {FUNNEL_STAGES.map((stage, index) => {
        const count = summary[stage.key];
        const reach = Math.round((count / total) * 100);
        const previous = index > 0 ? summary[FUNNEL_STAGES[index - 1].key] : null;
        const conversion = previous && previous > 0 ? Math.round((count / previous) * 100) : null;
        return (
          <div className="funnel-cell" key={stage.key}>
            <div className="funnel-cell-head">
              <strong>{count}</strong>
              {conversion !== null && (
                <span
                  className={`funnel-conv${conversion < 50 ? " is-low" : ""}`}
                  title={`Converted from ${FUNNEL_STAGES[index - 1].label.toLowerCase()}`}
                >
                  {conversion}%
                </span>
              )}
            </div>
            <span className="funnel-cell-label">{stage.label}</span>
            <span className="funnel-cell-bar"><span style={{ width: `${reach}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}

function JourneyTrack({ participant }: { participant: ParticipantActivitySummary }) {
  const states = journeyStepStates(participant);
  // Five bare dots told the reader nothing about *which* stage stalled. One
  // caption naming the live stage does, and stays compact enough for the row.
  const stalledAt = states.findIndex((state) => state !== "done");
  const caption = stalledAt === -1 ? "Complete" : JOURNEY_STEPS[stalledAt];
  return (
    <div className="journey-cell">
      <ol className="journey-steps" aria-label="Participant journey">
        {JOURNEY_STEPS.map((label, index) => (
          <li key={label} className={`is-${states[index]}`} title={label}>
            <span className="journey-step">
              <span className="journey-dot" aria-hidden="true" />
              <span className="journey-label sr-only">{label}</span>
            </span>
          </li>
        ))}
      </ol>
      <span className={`journey-caption${stalledAt === -1 ? " is-complete" : ""}`}>{caption}</span>
    </div>
  );
}

function ParticipantIdentity({ participant }: { participant: ParticipantActivitySummary }) {
  const username = participant.instagramUsername?.trim().replace(/^@+/, "");
  return (
    <div className="row-identity">
      <span className="participant-badge">
        <UserRound size={12} strokeWidth={2.2} />
        {username ? `@${username}` : "Instagram user"}
      </span>
      {(participant.variantLabel || participant.createdAt) && (
        <div className="row-identity-sub">
          {participant.variantLabel && <span className="tag-chip variant-chip">Variant {participant.variantLabel}</span>}
          {participant.createdAt && (
            <time className="row-time" dateTime={participant.createdAt} title={formatDateTime(participant.createdAt)}>
              {formatRelativeTime(participant.createdAt)}
            </time>
          )}
        </div>
      )}
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
  const publicReplyDetail = `${participant.publicReplyStatus}${participant.publicReplyError ? ` - ${participant.publicReplyError}` : ""}`;
  const openingDetail = `${participant.openingStatus}${participant.openingError ? ` - ${participant.openingError}` : ""}`;
  const deliveryDetail = [
    `${participant.finalDeliveryStatus}${participant.finalDeliveryError ? ` - ${participant.finalDeliveryError}` : ""}`,
    participant.finalDeliveredAt ? `Delivered ${formatTimestamp(participant.finalDeliveredAt)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <article className="activity-row">
      <div className="activity-row-grid">
        <ParticipantIdentity participant={participant} />
        <span className={`keyword-chip${participant.matchedKeyword ? "" : " is-any"}`}>
          {participant.matchedKeyword ? `“${participant.matchedKeyword}”` : "Any comment"}
        </span>
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
      <details className="row-detail">
        <summary className="row-detail-toggle">
          <ChevronRight size={13} className="row-detail-chevron" aria-hidden="true" />
          Delivery details
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
    <div className="activity-table-head">
      <span>Participant</span>
      <span>Trigger</span>
      <span>Journey</span>
      <span>Status</span>
      <span className="col-actions">Actions</span>
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
      <div className="filter-chips facebook-result-filters" aria-label="Facebook Page activity filters">
        {filters.map((filter) => (
          <button
            className={`filter-chip${result === filter.key ? " is-on" : ""}`}
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

export function AutomationActivity({ automationId }: { automationId: string }) {
  const [participants, setParticipants] = useState<ParticipantActivitySummary[] | null>(null);
  const [facebookActivity, setFacebookActivity] = useState<FacebookPageActivitySummary[] | null>(null);
  const [summary, setSummary] = useState<ParticipantFunnelSummary | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [retryingId, setRetryingId] = useState("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [query, setQuery] = useState("");
  const [campaign, setCampaign] = useState<CampaignContext | null>(null);

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
    fetch(`/api/automations/${automationId}/activity`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: ParticipantActivitySummary[] | FacebookPageActivitySummary[];
          channel?: { provider?: string; surface?: string };
          summary?: ParticipantFunnelSummary;
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
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load activity");
      })
      .finally(() => {
        if (active) setRefreshing(false);
      });
    return () => {
      active = false;
    };
  }, [automationId, reloadKey]);

  // Optional context strip: shows which campaign this activity belongs to.
  // Fails silently when the automation is unavailable or the request errors.
  useEffect(() => {
    let active = true;
    fetch(`/api/automations/${automationId}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as {
          data?: { id?: string; name?: string; status?: string };
          error?: string;
        };
        if (!response.ok || !payload.data?.name) throw new Error("No campaign context");
        if (active) {
          setCampaign({
            id: payload.data.id ?? automationId,
            name: payload.data.name,
            status: payload.data.status ?? "DRAFT",
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [automationId]);

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
  const groups = useMemo(() => {
    const order: string[] = [];
    const byMedia = new Map<string, ParticipantActivitySummary[]>();
    for (const p of filtered) {
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
  }, [filtered]);

  if (error && !participants) return <p className="form-error" role="alert">{error}</p>;

  if (!participants) {
    return <InlineContentSkeleton label="Loading campaign activity" rows={4} />;
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

  return (
    <div className="activity-list">
      {campaign && (
        <div className="campaign-strip">
          <div className="campaign-strip-id">
            <Workflow size={15} aria-hidden="true" />
            <span className="campaign-strip-name">{campaign.name}</span>
            <span className={`status-badge status-${campaign.status.toLowerCase()}`}>
              {statusBadgeLabel(campaign.status)}
            </span>
          </div>
          <Link className="campaign-strip-edit" href={`/automations/${automationId}/edit`}>
            <Pencil size={12} /> Edit campaign
          </Link>
        </div>
      )}

      {summary && <FunnelStrip summary={summary} />}

      {summary && (
        <p className="activity-clicks" title="Click rate across the participants currently loaded">
          <MousePointerClick size={14} aria-hidden="true" />
          {clickStats.delivered === 0
            ? "Link clicks appear once the first delivery goes out."
            : `${clickStats.clicked} of ${clickStats.delivered} delivered clicked the link (${clickStats.rate}%).`}
        </p>
      )}

      {summary && summary.commented > participants.length && (
        <p className="muted activity-truncated">
          Showing the latest {participants.length} of {summary.commented} participants. Export CSV for the full history.
        </p>
      )}

      <div className="feed-toolbar">
        <div className="filter-chips" role="group" aria-label="Filter by status">
          {FEED_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              className={`filter-chip${feedFilter === filter.key ? " is-on" : ""}`}
              aria-pressed={feedFilter === filter.key}
              onClick={() => setFeedFilter(filter.key)}
            >
              {filter.label}
              <span className="chip-count">{filterCounts[filter.key]}</span>
            </button>
          ))}
        </div>

        <div className="feed-tools">
          <label className="feed-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search keyword or caption"
              aria-label="Search participants"
            />
          </label>
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
        </div>
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
    </div>
  );
}
