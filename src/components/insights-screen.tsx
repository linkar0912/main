"use client";

import { Download, MailCheck, MousePointerClick, RefreshCw, Send, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "./app-shell";
import { InsightsContentSkeleton } from "./skeleton";
import { ReplyVolumeChart, type DayPoint } from "./reply-volume-chart";

type MediaPerformance = { mediaId: string; matched: number; delivered: number; clicked: number };
type InsightsPayload = {
  funnel: Record<string, number>;
  timeseries: { days: number; participantsPerDay: DayPoint[]; sentPerDay: DayPoint[] };
  mediaPerformance: MediaPerformance[];
  capturedEmails: number;
  optedOut: number;
  usage: { participantsThisMonth: number; monthlyLimit: number | null };
};

const FUNNEL_STAGES = [
  ["COMMENT_MATCHED", "Matched"],
  ["OPENING_SENT", "Opening sent"],
  ["OPTED_IN", "Opted in"],
  ["FOLLOW_VERIFIED", "Follow verified"],
  ["LINK_SENT", "Link delivered"],
] as const;

function sum(points: DayPoint[]): number {
  return points.reduce((total, point) => total + point.count, 0);
}

function Metric({ label, value, note, icon: Icon }: { label: string; value: number; note: string; icon: typeof Send }) {
  return (
    <div className="insights-metric" role="listitem">
      <div className="stat-block insights-metric-body" role="group" aria-label={label}>
        <span className="stat-label"><Icon size={15} strokeWidth={1.8} /><span>{label}</span></span>
        <span className="stat-value-row"><strong>{value.toLocaleString()}</strong></span>
        <small className="stat-note">{note}</small>
      </div>
    </div>
  );
}

export function InsightsScreen() {
  const [data, setData] = useState<InsightsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/insights", { signal });
      const payload = (await response.json().catch(() => ({}))) as Partial<InsightsPayload> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load insights");
      setData(payload as InsightsPayload);
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [load]);

  const totals = useMemo(() => ({
    sent: sum(data?.timeseries.sentPerDay ?? []),
    reached: sum(data?.timeseries.participantsPerDay ?? []),
  }), [data]);

  return (
    <AppShell>
      <main className="page-wrap insights-page">
        <header className="page-header insights-page-header">
          <div>
            <p className="eyebrow">Workspace / Insights</p>
            <h1>Insights</h1>
            <p className="page-subtitle">See what your automations reach, deliver, and convert.</p>
          </div>
          <a className="button button-secondary" href="/api/insights/export" download><Download size={16} /> Export CSV</a>
        </header>

        {loading && (
          <InsightsContentSkeleton />
        )}

        {!loading && error && (
          <section className="panel insights-error">
            <div><p className="eyebrow">Could not load</p><h2>Insights are temporarily out of reach</h2></div>
            <p className="form-error" role="alert">{error}</p>
            <button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw size={15} /> Try again</button>
          </section>
        )}

        {!loading && data && (
          <div className="insights-workspace">
            <section className="stat-row insights-metrics" role="list" aria-label="Performance summary">
              <Metric label="Replies sent" value={totals.sent} note="Last 14 days" icon={Send} />
              <Metric label="People reached" value={totals.reached} note="Last 14 days" icon={UsersRound} />
              <Metric label="Emails captured" value={data.capturedEmails} note="All time" icon={MailCheck} />
              <Metric label="Link clicks" value={data.mediaPerformance.reduce((total, row) => total + row.clicked, 0)} note={`${data.optedOut.toLocaleString()} opted out`} icon={MousePointerClick} />
            </section>

            <section className="panel chart-panel insights-volume" aria-label="Performance over time">
              <div className="panel-heading insights-heading-row">
                <div><p className="eyebrow">Last {data.timeseries.days} days</p><h2>Reply volume</h2></div>
              </div>
              <ReplyVolumeChart sent={data.timeseries.sentPerDay} reached={data.timeseries.participantsPerDay} days={data.timeseries.days} />
            </section>

            <div className="insights-detail-grid">
              <section className="panel insights-journey" aria-label="Automation journey">
                <div className="panel-heading insights-detail-heading"><div><p className="eyebrow">Live position</p><h2>Automation journey</h2></div></div>
                <ol>
                  {FUNNEL_STAGES.map(([key, label]) => (
                    <li key={key}><span>{label}</span><strong>{(data.funnel[key] ?? 0).toLocaleString()}</strong></li>
                  ))}
                </ol>
              </section>

              <section className="panel insights-content" aria-label="Content performance">
                <div className="panel-heading insights-detail-heading"><div><p className="eyebrow">Top posts</p><h2>Content performance</h2></div></div>
                {data.mediaPerformance.length ? (
                  <div className="table-scroll">
                    <table className="insights-table" aria-label="Top content performance">
                      <thead><tr><th>Post</th><th>Matched</th><th>Delivered</th><th>Clicks</th><th>Click rate</th></tr></thead>
                      <tbody>{data.mediaPerformance.map((row) => (
                        <tr key={row.mediaId}><td className="media-id-cell" title={row.mediaId}>{row.mediaId}</td><td>{row.matched}</td><td>{row.delivered}</td><td>{row.clicked}</td><td>{row.delivered ? `${Math.round((row.clicked / row.delivered) * 100)}%` : "—"}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="muted insights-empty-copy">Post-level performance appears after an automation matches a comment.</p>}
              </section>
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
