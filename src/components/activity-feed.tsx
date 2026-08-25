"use client";

import { useEffect, useState } from "react";

type ActivityEntry = {
  id: string;
  type: string;
  label: string;
  at: string;
  account?: string;
  from?: string;
  summary?: string;
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Live inbox of recent inbound Instagram events, served by /api/activity. */
export function ActivityFeed() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/activity?limit=100${filter ? `&type=${encodeURIComponent(filter)}` : ""}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: ActivityEntry[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load activity");
        if (!cancelled) setEntries(payload.data ?? []);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load activity");
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  if (!loaded) {
    return (
      <div className="empty-state">
        <div className="loading-line" />
        <div className="loading-line short" />
      </div>
    );
  }
  if (error) return <p className="form-error" role="alert">{error}</p>;

  return (
    <section className="panel full-list-panel" aria-label="Recent Instagram activity">
      <div className="list-intro">
        <p className="muted">
          {entries.length} event{entries.length === 1 ? "" : "s"} in the last stretch
        </p>
        <label className="field">
          <span className="sr-only">Filter by type</span>
          <select aria-label="Filter activity by type" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="">All events</option>
            <option value="comment.created">Comments</option>
            <option value="message.received">Direct messages</option>
            <option value="quick_reply.received">Quick replies</option>
            <option value="postback.received">Button taps</option>
            <option value="optin.received">Opt-ins</option>
            <option value="referral.received">Referral taps</option>
            <option value="story_mention.received">Story mentions</option>
          </select>
        </label>
      </div>
      {entries.length === 0 ? (
        <p className="muted">
          Nothing here yet. Once an account is connected and people start commenting or messaging,
          every inbound event shows up here.
        </p>
      ) : (
        <ul className="activity-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div className="activity-row">
                <span className="activity-label">{entry.label}</span>
                {entry.from && <span className="activity-from">{entry.from}</span>}
                <time dateTime={entry.at}>{formatDate(entry.at)}</time>
              </div>
              {entry.summary && <p className="muted activity-summary">{entry.summary}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
