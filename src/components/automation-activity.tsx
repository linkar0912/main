"use client";

import { ExternalLink, Radio } from "lucide-react";
import { useEffect, useState } from "react";
import type { AutomationParticipantRecord, ParticipantState } from "@/src/lib/repository";
import { formatDateTime } from "@/src/lib/format-date";

export type ParticipantActivitySummary = Pick<
  AutomationParticipantRecord,
  | "sourceMediaSnapshot"
  | "matchedKeyword"
  | "state"
  | "followStatus"
  | "followCheckedAt"
  | "publicReplyStatus"
  | "publicReplyError"
  | "openingStatus"
  | "openingError"
  | "finalDeliveryStatus"
  | "finalDeliveryError"
  | "finalDeliveredAt"
>;

export type ParticipantFunnelSummary = {
  commented: number;
  openingSent: number;
  optedIn: number;
  followed: number;
  linkSent: number;
};

const FUNNEL_STAGES: { key: keyof ParticipantFunnelSummary; label: string }[] = [
  { key: "commented", label: "Commented" },
  { key: "openingSent", label: "Got the DM" },
  { key: "optedIn", label: "Opted in" },
  { key: "followed", label: "Followed" },
  { key: "linkSent", label: "Got the link" },
];

function FunnelSummary({ summary }: { summary: ParticipantFunnelSummary }) {
  return (
    <div className="activity-funnel" aria-label="Campaign funnel">
      {FUNNEL_STAGES.map((stage, index) => (
        <div className="funnel-stage" key={stage.key}>
          <span className="funnel-count">{summary[stage.key]}</span>
          <span className="funnel-label">{stage.label}</span>
          {index < FUNNEL_STAGES.length - 1 && <span className="funnel-arrow" aria-hidden="true">→</span>}
        </div>
      ))}
    </div>
  );
}

function formatTimestamp(value?: string): string {
  if (!value) return "not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "not yet" : formatDateTime(date);
}

function participantStateLabel(state: ParticipantState): string {
  return state.toLowerCase().replaceAll("_", " ");
}

function ParticipantStateBadge({ state }: { state: ParticipantState }) {
  return <span className={`status-badge status-${state.toLowerCase()}`}>{participantStateLabel(state)}</span>;
}

function followSummary(participant: ParticipantActivitySummary): string {
  if (participant.followStatus === true) return `Following · checked ${formatTimestamp(participant.followCheckedAt)}`;
  if (participant.followStatus === false) return `Not following yet · checked ${formatTimestamp(participant.followCheckedAt)}`;
  return "Not checked yet";
}

function ActivityRow({ participant }: { participant: ParticipantActivitySummary }) {
  const media = participant.sourceMediaSnapshot;
  return (
    <article className="activity-row">
      <div className="activity-row-top">
        <div className="activity-media">
          <span className="media-type-label">{media.mediaProductType ?? media.mediaType}</span>
          <p className="activity-caption">{media.caption || "Untitled Reel"}</p>
        </div>
        <ParticipantStateBadge state={participant.state} />
      </div>
      <p className="muted activity-keyword">Matched keyword: {participant.matchedKeyword ?? "Any comment"}</p>
      <dl className="activity-diagnostics">
        <div>
          <dt>Public reply</dt>
          <dd>{participant.publicReplyStatus}{participant.publicReplyError ? ` — ${participant.publicReplyError}` : ""}</dd>
        </div>
        <div>
          <dt>Opening DM</dt>
          <dd>{participant.openingStatus}{participant.openingError ? ` — ${participant.openingError}` : ""}</dd>
        </div>
        <div>
          <dt>Follow check</dt>
          <dd>{followSummary(participant)}</dd>
        </div>
        <div>
          <dt>Final delivery</dt>
          <dd>
            {participant.finalDeliveryStatus}
            {participant.finalDeliveryError ? ` — ${participant.finalDeliveryError}` : ""}
            {participant.finalDeliveredAt ? ` · delivered ${formatTimestamp(participant.finalDeliveredAt)}` : ""}
          </dd>
        </div>
      </dl>
      <a className="text-link activity-permalink" href={media.permalink} target="_blank" rel="noreferrer">
        View on Instagram <ExternalLink size={13} />
      </a>
    </article>
  );
}

export function AutomationActivity({ automationId }: { automationId: string }) {
  const [participants, setParticipants] = useState<ParticipantActivitySummary[] | null>(null);
  const [summary, setSummary] = useState<ParticipantFunnelSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/automations/${automationId}/activity`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: ParticipantActivitySummary[]; summary?: ParticipantFunnelSummary; error?: string };
        if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load activity");
        if (active) {
          setParticipants(payload.data);
          setSummary(payload.summary ?? null);
        }
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load activity");
      });
    return () => {
      active = false;
    };
  }, [automationId]);

  if (error) return <p className="form-error" role="alert">{error}</p>;

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

  return (
    <div className="activity-list">
      {summary && <FunnelSummary summary={summary} />}
      {participants.map((participant, index) => <ActivityRow participant={participant} key={index} />)}
    </div>
  );
}
