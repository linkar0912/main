"use client";

import Link from "next/link";
import {
  Check,
  Clock,
  ExternalLink,
  Minus,
  MousePointerClick,
  Pencil,
  Radio,
  RefreshCw,
  RotateCcw,
  Search,
  Workflow,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ParticipantState } from "@/src/lib/repository";
import { formatDateTime } from "@/src/lib/format-date";
import type { ParticipantActivitySummary, ParticipantFunnelSummary } from "@/src/lib/automation/activity-summary";

export type { ParticipantActivitySummary, ParticipantFunnelSummary };

type CampaignContext = { id: string; name: string; status: string };

const FUNNEL_STAGES: { key: keyof ParticipantFunnelSummary; label: string }[] = [
  { key: "commented", label: "Commented" },
  { key: "openingSent", label: "Got the DM" },
  { key: "optedIn", label: "Opted in" },
  { key: "followed", label: "Followed" },
  { key: "linkSent", label: "Got the link" },
];

const JOURNEY_STEPS = ["Comment", "DM", "Opt-in", "Follow", "Link"] as const;

const OPTED_IN_OR_LATER = new Set<ParticipantState>(["OPTED_IN", "FOLLOW_REQUIRED", "FOLLOW_VERIFIED", "LINK_SENT"]);
const FOLLOWED_STATES = new Set<ParticipantState>(["FOLLOW_VERIFIED", "LINK_SENT"]);
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
    OPTED_IN_OR_LATER.has(participant.state),
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

function FunnelSummary({ summary }: { summary: ParticipantFunnelSummary }) {
  const total = Math.max(1, summary.commented);
  return (
    <div className="activity-funnel" aria-label="Campaign funnel">
      {FUNNEL_STAGES.map((stage, index) => {
        const count = summary[stage.key];
        const reach = Math.round((count / total) * 100);
        const previous = index > 0 ? summary[FUNNEL_STAGES[index - 1].key] : null;
        const conversion = previous && previous > 0 ? Math.round((count / previous) * 100) : null;
        return (
          <div className="funnel-stage" key={stage.key}>
            <div className="funnel-tile">
              <div className="funnel-head">
                <span className="funnel-count">{count}</span>
                {conversion !== null && (
                  <span
                    className={`funnel-conv${conversion < 50 ? " is-low" : ""}`}
                    title={`Converted from ${FUNNEL_STAGES[index - 1].label.toLowerCase()}`}
                  >
                    {conversion}%
                  </span>
                )}
              </div>
              <span className="funnel-label">{stage.label}</span>
              <span className="funnel-bar"><span style={{ width: `${reach}%` }} /></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function JourneyTrack({ participant }: { participant: ParticipantActivitySummary }) {
  const states = journeyStepStates(participant);
  return (
    <ol className="journey-steps" aria-label="Participant journey">
      {JOURNEY_STEPS.map((label, index) => (
        <li key={label} className={`is-${states[index]}`}>
          <span className="journey-step">
            <span className="journey-dot" aria-hidden="true" />
            <span className="journey-label">{label}</span>
          </span>
        </li>
      ))}
    </ol>
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
      <header className="activity-row-top">
        <div className="activity-media">
          <span className="media-type-label">{media.mediaProductType ?? media.mediaType}</span>
          <p className="activity-caption">{media.caption || "Untitled Reel"}</p>
        </div>
        <div className="activity-row-meta">
          <span className={`keyword-chip${participant.matchedKeyword ? "" : " is-any"}`}>
            {participant.matchedKeyword ? `\u201C${participant.matchedKeyword}\u201D` : "Any comment"}
          </span>
          <ParticipantStateBadge state={participant.state} />
        </div>
      </header>
      <JourneyTrack participant={participant} />
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
      <footer className="activity-row-foot">
        {participant.state === "FAILED" && onRetry && (
          <button type="button" className="button button-secondary button-small activity-retry" onClick={onRetry} disabled={retrying}>
            <RotateCcw size={13} /> {retrying ? "Retrying…" : "Retry delivery"}
          </button>
        )}
        <a className="text-link" href={media.permalink} target="_blank" rel="noreferrer">
          View on Instagram <ExternalLink size={13} />
        </a>
      </footer>
    </article>
  );
}

function statusBadgeLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function AutomationActivity({ automationId }: { automationId: string }) {
  const [participants, setParticipants] = useState<ParticipantActivitySummary[] | null>(null);
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
          data?: ParticipantActivitySummary[];
          summary?: ParticipantFunnelSummary;
          error?: string;
        };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load activity");
        if (active) {
          setParticipants(payload.data);
          setSummary(payload.summary ?? null);
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

  if (error && !participants) return <p className="form-error" role="alert">{error}</p>;

  if (!participants) {
    return (
      <div className="empty-state">
        <div className="loading-line" />
        <div className="loading-line short" />
        <div className="loading-line" />
      </div>
    );
  }

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
        <div className="campaign-context">
          <div className="context-id">
            <span className="context-icon" aria-hidden="true"><Workflow size={17} /></span>
            <div className="context-name">
              <strong>{campaign.name}</strong>
              <small>Campaign</small>
            </div>
          </div>
          <div className="context-actions">
            <span className={`status-badge status-${campaign.status.toLowerCase()}`}>
              {statusBadgeLabel(campaign.status)}
            </span>
            <Link className="context-edit" href={`/automations/${automationId}/edit`}>
              <Pencil size={12} /> Edit campaign
            </Link>
          </div>
        </div>
      )}

      {summary && <FunnelSummary summary={summary} />}

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
        filtered.map((participant) => (
          <ActivityRow key={participant.id} participant={participant} onRetry={() => void retryParticipant(participant.id)} retrying={retryingId === participant.id} />
        ))
      )}
    </div>
  );
}






