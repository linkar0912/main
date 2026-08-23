"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

type DailyCount = { day: string; count: number };
type MediaPerformance = { mediaId: string; matched: number; delivered: number; clicked: number };

type InsightsPayload = {
  usage?: { participantsThisMonth: number; monthlyLimit: number | null };
  timeseries?: { days: number; participantsPerDay: DailyCount[]; sentPerDay: DailyCount[] };
  mediaPerformance?: MediaPerformance[];
};

function dayLabel(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function InsightsPanel({ automationId }: { automationId?: string }) {
  const [insights, setInsights] = useState<InsightsPayload | null>(null);
  const [error, setError] = useState("");
  const query = automationId ? `?automationId=${encodeURIComponent(automationId)}` : "";

  useEffect(() => {
    let active = true;
    fetch(`/api/insights${query}`)
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as InsightsPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Could not load insights");
        if (active) setInsights(payload);
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load insights");
      });
    return () => {
      active = false;
    };
  }, [query]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!insights) {
    return (
      <div className="empty-state">
        <div className="loading-line" />
        <div className="loading-line short" />
      </div>
    );
  }

  const participantsPerDay = insights.timeseries?.participantsPerDay ?? [];
  const sentPerDay = insights.timeseries?.sentPerDay ?? [];
  const peak = Math.max(1, ...participantsPerDay.map((entry) => entry.count), ...sentPerDay.map((entry) => entry.count));
  const sentByDay = new Map(sentPerDay.map((entry) => [entry.day, entry.count]));
  const posts = insights.mediaPerformance ?? [];
  const usage = insights.usage;
  const usageLimit = usage?.monthlyLimit ?? null;
  const usagePercent =
    usage && usageLimit ? Math.min(100, Math.round((usage.participantsThisMonth / usageLimit) * 100)) : null;

  return (
    <div className="insights-stack side-stack">
      {usage && (
        <section className="panel side-panel" aria-label="Plan usage">
          <div className="panel-heading">
            <div><p className="eyebrow">Plan usage</p><h2>This month</h2></div>
          </div>
          <div className="usage-meter">
            {usagePercent !== null && usageLimit !== null && (
              <div
                className="usage-bar"
                role="progressbar"
                aria-label="Participants used this month"
                aria-valuenow={usage.participantsThisMonth}
                aria-valuemin={0}
                aria-valuemax={usageLimit}
              >
                <span style={{ width: `${Math.max(usagePercent, usage.participantsThisMonth > 0 ? 4 : 0)}%` }} />
              </div>
            )}
            <p className="muted usage-note">
              {usage.participantsThisMonth} participant{usage.participantsThisMonth === 1 ? "" : "s"} this month
              {usage.monthlyLimit ? ` of ${usage.monthlyLimit}` : ""} on the current plan.
            </p>
          </div>
        </section>
      )}

      <section className="panel insights-panel side-panel" aria-label="Last 14 days">
        <div className="panel-heading">
          <div><p className="eyebrow">Last 14 days</p><h2>Participants & deliveries</h2></div>
        </div>
        <div className="insights-chart" role="img" aria-label="Daily participants and deliveries for the last 14 days">
          {participantsPerDay.map((entry) => {
            const sent = sentByDay.get(entry.day) ?? 0;
            return (
              <div className="chart-column" key={entry.day} title={`${dayLabel(entry.day)}: ${entry.count} participants, ${sent} delivered`}>
                <div className="chart-bars">
                  <span className="chart-bar bar-participants" style={{ height: `${Math.round((entry.count / peak) * 100)}%` }} />
                  <span className="chart-bar bar-sent" style={{ height: `${Math.round((sent / peak) * 100)}%` }} />
                </div>
                <small>{dayLabel(entry.day)}</small>
              </div>
            );
          })}
        </div>
        <p className="chart-legend">
          <span className="legend-swatch swatch-participants" /> Participants
          <span className="legend-swatch swatch-sent" /> Delivered
        </p>
      </section>

      <section className="panel insights-panel side-panel" aria-label="Top posts">
        <div className="panel-heading">
          <div><p className="eyebrow">Per-post performance</p><h2>Top posts</h2></div>
          <a className="button button-secondary button-small" href={`/api/insights/export${query}`} download>
            <Download size={14} /> Export CSV
          </a>
        </div>
        {posts.length === 0 ? (
          <p className="muted">No participant activity yet — performance appears after the first matched comment.</p>
        ) : (
          <table className="insights-table">
            <thead>
              <tr><th scope="col">Post</th><th scope="col">Matched</th><th scope="col">Delivered</th><th scope="col">Clicked</th></tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.mediaId}>
                  <td className="media-id-cell">{post.mediaId}</td>
                  <td>{post.matched}</td>
                  <td>{post.delivered}</td>
                  <td>{post.clicked}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
