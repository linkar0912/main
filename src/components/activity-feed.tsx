"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Inbox,
  Link2,
  MessageCircle,
  MousePointerClick,
  Send,
  UserCheck,
} from "lucide-react";

type ActivityEntry = {
  id: string;
  type: string;
  label: string;
  at: string;
  account?: string;
  from?: string;
  summary?: string;
};

type EventMeta = { icon: typeof MessageCircle; tone: string };

const EVENT_META: Record<string, EventMeta> = {
  "comment.created": { icon: MessageCircle, tone: "slate" },
  "message.received": { icon: Send, tone: "accent" },
  "quick_reply.received": { icon: MousePointerClick, tone: "grape" },
  "postback.received": { icon: MousePointerClick, tone: "grape" },
  "optin.received": { icon: UserCheck, tone: "leaf" },
  "referral.received": { icon: Link2, tone: "honey" },
  "story_mention.received": { icon: AtSign, tone: "flame" },
};
const DEFAULT_META: EventMeta = { icon: Inbox, tone: "slate" };

const FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All" },
  { value: "comment.created", label: "Comments" },
  { value: "message.received", label: "Direct messages" },
  { value: "quick_reply.received", label: "Quick replies" },
  { value: "postback.received", label: "Button taps" },
  { value: "optin.received", label: "Opt-ins" },
  { value: "referral.received", label: "Referral taps" },
  { value: "story_mention.received", label: "Story mentions" },
];

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayHeading(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function groupByDay(entries: ActivityEntry[]): Array<{ heading: string; entries: ActivityEntry[] }> {
  const groups: Array<{ heading: string; entries: ActivityEntry[] }> = [];
  for (const entry of entries) {
    const heading = dayHeading(entry.at);
    const current = groups[groups.length - 1];
    if (current && current.heading === heading) current.entries.push(entry);
    else groups.push({ heading, entries: [entry] });
  }
  return groups;
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

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    for (const entry of entries) byType.set(entry.type, (byType.get(entry.type) ?? 0) + 1);
    return byType;
  }, [entries]);

  const groups = useMemo(() => groupByDay(entries), [entries]);

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
    <section aria-label="Recent Instagram activity">
      {entries.length > 0 && (
        <div className="inbox-stat-strip" aria-hidden={filter !== ""}>
          {FILTERS.slice(1).map(({ value, label }) => {
            const count = counts.get(value) ?? 0;
            if (count === 0) return null;
            return (
              <div className="inbox-stat-tile" key={value}>
                <strong>{count}</strong>
                <span>{label}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="list-intro">
        <p className="muted">
          {entries.length} event{entries.length === 1 ? "" : "s"} in the last stretch
        </p>
        <div className="filter-chips" role="group" aria-label="Filter activity by type">
          {FILTERS.map(({ value, label }) => (
            <button
              key={value || "all"}
              type="button"
              className={`filter-chip ${filter === value ? "is-on" : ""}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Inbox size={20} /></span>
          <h3>Nothing here yet</h3>
          <p>Once an account is connected and people start commenting or messaging, every inbound event shows up here.</p>
        </div>
      ) : (
        <div className="inbox-groups">
          {groups.map((group) => (
            <div className="inbox-group" key={group.heading + group.entries[0]?.id}>
              <p className="inbox-day-heading">{group.heading}</p>
              <ul className="inbox-list">
                {group.entries.map((entry) => {
                  const meta = EVENT_META[entry.type] ?? DEFAULT_META;
                  const Icon = meta.icon;
                  return (
                    <li key={entry.id}>
                      <div className={`inbox-type-icon tone-${meta.tone}`} aria-hidden>
                        <Icon size={15} strokeWidth={2} />
                      </div>
                      <div className="inbox-body">
                        <div className="inbox-row">
                          <span className="inbox-label">{entry.label}</span>
                          {entry.from && (
                            <span className={entry.from.startsWith("@") ? "inbox-from" : "inbox-from is-id"}>
                              {entry.from}
                            </span>
                          )}
                          <time className="inbox-time" dateTime={entry.at}>{formatTime(entry.at)}</time>
                        </div>
                        {entry.summary && <p className="muted inbox-summary">{entry.summary}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
