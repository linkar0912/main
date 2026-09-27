"use client";

import { Download, MailCheck, MousePointerClick, RefreshCw, Send, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { InsightsContentSkeleton } from "./skeleton";
import type { DayPoint } from "./reply-volume-chart";
import { ReplyVolumeCard } from "./reply-volume-card";
import { halfWindowDelta, StatGrid, StatTile } from "./stat-tile";
import { PageHeader, SectionCard } from "./page-header";

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

// Stale-while-revalidate like contacts/automations: a revisit paints the last
// confirmed numbers immediately and refreshes quietly in the background.
const INSIGHTS_FRESH_FOR_MS = 60_000;
const insightsCache: { value?: InsightsPayload; fetchedAt?: number; fetcher?: typeof fetch } = {};

function readInsightsCache(): InsightsPayload | undefined {
  return insightsCache.fetcher === fetch ? insightsCache.value : undefined;
}

function sum(points: DayPoint[]): number {
  return points.reduce((total, point) => total + point.count, 0);
}

export function InsightsScreen() {
  const [data, setData] = useState<InsightsPayload | null>(() => readInsightsCache() ?? null);
  const [loading, setLoading] = useState(() => readInsightsCache() === undefined);
  const [error, setError] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    // Keep cached numbers on screen while refreshing instead of flashing skeletons.
    if (!readInsightsCache()) setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/insights", { signal });
      const payload = (await response.json().catch(() => ({}))) as Partial<InsightsPayload> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load insights");
      const next: InsightsPayload = {
        funnel: payload.funnel ?? {},
        timeseries: {
          days: payload.timeseries?.days ?? 0,
          participantsPerDay: payload.timeseries?.participantsPerDay ?? [],
          sentPerDay: payload.timeseries?.sentPerDay ?? [],
        },
        mediaPerformance: payload.mediaPerformance ?? [],
        capturedEmails: payload.capturedEmails ?? 0,
        optedOut: payload.optedOut ?? 0,
        usage: payload.usage ?? { participantsThisMonth: 0, monthlyLimit: null },
      };
      insightsCache.value = next;
      insightsCache.fetchedAt = Date.now();
      insightsCache.fetcher = fetch;
      setData(next);
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load insights");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cachedAt = insightsCache.fetcher === fetch ? insightsCache.fetchedAt ?? 0 : 0;
    if (Date.now() - cachedAt < INSIGHTS_FRESH_FOR_MS) return () => controller.abort();
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
    <>
      <main className="page-wrap insights-page">
        <PageHeader
          className="insights-page-header"
          title="Insights"
          description="See what your automations reach, deliver, and convert."
          actions={<a className="button button-secondary" href="/api/insights/export" download><Download size={16} /> Export CSV</a>}
        />

        {loading && (
          <InsightsContentSkeleton />
        )}

        {!loading && error && (
          <section className="surface insights-error">
            <div className="surface-head"><div className="surface-head-copy"><h2>Insights are temporarily out of reach</h2></div></div>
            <p className="form-error" role="alert">{error}</p>
            <button className="button button-secondary" type="button" onClick={() => void load()}><RefreshCw size={15} /> Try again</button>
          </section>
        )}

        {!loading && data && (
          <div className="insights-workspace">
            <StatGrid>
              <StatTile label="Replies sent" icon={Send} value={totals.sent} note={`Last ${data.timeseries.days} days`} delta={halfWindowDelta(data.timeseries.sentPerDay)} />
              <StatTile label="People reached" icon={UsersRound} value={totals.reached} note={`Last ${data.timeseries.days} days`} delta={halfWindowDelta(data.timeseries.participantsPerDay)} />
              <StatTile label="Emails captured" icon={MailCheck} value={data.capturedEmails} note={`${data.optedOut.toLocaleString()} opted out · respected`} />
              <StatTile label="Link clicks" icon={MousePointerClick} value={data.mediaPerformance.reduce((total, row) => total + row.clicked, 0)} note="From tracked links" />
            </StatGrid>

            <ReplyVolumeCard sent={data.timeseries.sentPerDay} reached={data.timeseries.participantsPerDay} days={data.timeseries.days} />

            <div className="insights-detail-grid">
              <SectionCard className="insights-journey" aria-label="Automation journey" title="Automation journey" description="Where people currently sit in your flows.">
                <ol>
                  {FUNNEL_STAGES.map(([key, label]) => (
                    <li key={key}><span>{label}</span><strong>{(data.funnel[key] ?? 0).toLocaleString()}</strong></li>
                  ))}
                </ol>
              </SectionCard>

              <SectionCard className="insights-content" flush aria-label="Content performance" title="Content performance" description="Top posts by matched comments.">
                {data.mediaPerformance.length ? (
                  <div className="table-scroll">
                    <table className="insights-table" aria-label="Top content performance">
                      <thead><tr><th>Post</th><th>Matched</th><th>Delivered</th><th>Clicks</th><th>Click rate</th></tr></thead>
                      <tbody>{data.mediaPerformance.map((row) => (
                        <tr key={row.mediaId}><td className="media-id-cell" title={`Instagram media ID ${row.mediaId}`}>Instagram post · {row.mediaId.slice(-6)}</td><td>{row.matched}</td><td>{row.delivered}</td><td>{row.clicked}</td><td>{row.delivered ? `${Math.round((row.clicked / row.delivered) * 100)}%` : "-"}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                ) : <p className="muted insights-empty-copy">Post-level performance appears after an automation matches a comment.</p>}
              </SectionCard>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
