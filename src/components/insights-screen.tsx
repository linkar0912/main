"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Download, Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useAutomations } from "./automation-list";
import { CreateAutomationButton } from "./create-automation-button";
import { FacebookGlyph } from "./facebook-glyph";
import { InstagramGlyph } from "./instagram-glyph";
import { PageHeader, SectionCard } from "./page-header";
import { PerformanceFigure, PeriodChangeNote } from "./performance-figures";
import { InsightsContentSkeleton } from "./skeleton";
import { TrackedLinksPanel } from "./tracked-links-panel";
import { TrendChart } from "./trend-chart";
import { LocalIdChip, LocalStatusBadge, lifecycleStatus } from "./workspace-primitives";
import type { AutomationRecord } from "@/src/lib/repository";
import {
  biggestDrop,
  journeySteps,
  periodChange,
  plural,
  repliesHeadline,
  repliesSupport,
  sumPoints,
  type DayPoint,
  type JourneyCounts,
} from "@/src/lib/insights-summary";

type MediaPerformance = { mediaId: string; matched: number; delivered: number; clicked: number };
type AutomationOutcome = { automationId: string; sent: number; failed: number; skipped: number };
type InsightsPayload = {
  journey: JourneyCounts;
  timeseries: { days: number; participantsPerDay: DayPoint[]; sentPerDay: DayPoint[] };
  previous?: { sent: number; reached: number };
  automations: AutomationOutcome[];
  mediaPerformance: MediaPerformance[];
  capturedEmails: number;
  optedOut: number;
};

type MediaInfo = { caption?: string; permalink?: string; thumbnailUrl?: string; productType?: string };

export const RANGE_OPTIONS = [7, 14, 30] as const;
type Range = (typeof RANGE_OPTIONS)[number];

const EMPTY_JOURNEY: JourneyCounts = { commented: 0, openingSent: 0, optedIn: 0, followed: 0, linkSent: 0 };

/** Older payloads only carry per-state counts; fold them into the cumulative journey. */
function journeyFromStates(funnel: Record<string, number> | undefined): JourneyCounts {
  if (!funnel) return EMPTY_JOURNEY;
  const total = Object.values(funnel).reduce((sum, value) => sum + value, 0);
  const atLeast = (states: string[]) => states.reduce((sum, state) => sum + (funnel[state] ?? 0), 0);
  return {
    commented: total,
    openingSent: atLeast(["OPENING_SENT", "OPTED_IN", "FOLLOW_REQUIRED", "FOLLOW_VERIFIED", "LINK_SENT"]),
    optedIn: atLeast(["OPTED_IN", "FOLLOW_REQUIRED", "FOLLOW_VERIFIED", "LINK_SENT"]),
    followed: atLeast(["FOLLOW_VERIFIED", "LINK_SENT"]),
    linkSent: atLeast(["LINK_SENT"]),
  };
}

// Stale-while-revalidate per filter: a revisit (or switching back to a range
// already seen) paints the last confirmed numbers immediately and refreshes
// quietly in the background.
const INSIGHTS_FRESH_FOR_MS = 60_000;
const insightsCache = new Map<string, { value: InsightsPayload; fetchedAt: number; fetcher: typeof fetch }>();

function cacheKey(range: Range, automationId: string): string {
  return `${range}|${automationId}`;
}

function readCache(key: string): { value: InsightsPayload; fetchedAt: number } | undefined {
  const entry = insightsCache.get(key);
  return entry && entry.fetcher === fetch ? entry : undefined;
}

function insightsUrl(range: Range, automationId: string): string {
  const params = new URLSearchParams({ days: String(range) });
  if (automationId) params.set("automationId", automationId);
  return `/api/insights?${params.toString()}`;
}

function enterStyle(delay: number): CSSProperties {
  return { "--enter-delay": `${delay}ms` } as CSSProperties;
}

/** Captions and covers for the posts in "Top posts": automation snapshots first, then the account's media list. */
function snapshotMedia(automations: AutomationRecord[]): Map<string, MediaInfo> {
  const media = new Map<string, MediaInfo>();
  for (const automation of automations) {
    const trigger = automation.definition.trigger as { mediaSnapshots?: Array<{ id: string; caption?: string; permalink?: string; mediaProductType?: string }> };
    for (const snapshot of trigger.mediaSnapshots ?? []) {
      media.set(snapshot.id, { caption: snapshot.caption, permalink: snapshot.permalink, productType: snapshot.mediaProductType });
    }
  }
  return media;
}

type SortKey = "name" | "sent" | "failed" | "rate";

type AutomationRow = {
  id: string;
  name: string;
  status: string;
  facebook: boolean;
  sent: number;
  failed: number;
  /** Share of attempts that went out (0-100), null when nothing was attempted. */
  rate: number | null;
};

function sortRows(rows: AutomationRow[], key: SortKey, direction: "asc" | "desc"): AutomationRow[] {
  const sign = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    if (key === "name") return sign * left.name.localeCompare(right.name);
    const a = key === "rate" ? left.rate ?? -1 : left[key];
    const b = key === "rate" ? right.rate ?? -1 : right[key];
    return sign * (a - b) || left.name.localeCompare(right.name);
  });
}

function SortHeader({ label, column, sort, onSort, numeric = false }: {
  label: string;
  column: SortKey;
  sort: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  numeric?: boolean;
}) {
  const active = sort.key === column;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={numeric ? "is-number" : undefined} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="ins-sort" onClick={() => onSort(column)}>
        {label}<Icon size={14} aria-hidden />
      </button>
    </th>
  );
}

function AutomationTable({ rows, days }: { rows: AutomationRow[]; days: number }) {
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "sent", direction: "desc" });
  const sorted = useMemo(() => sortRows(rows, sort.key, sort.direction), [rows, sort]);
  const peak = Math.max(1, ...rows.map((row) => row.sent));
  function onSort(key: SortKey) {
    setSort((current) => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "name" ? "asc" : "desc" });
  }
  return (
    <div className="table-scroll ins-table-scroll">
      <table className="ins-table" aria-label={`Automation results for the last ${days} days`}>
        <thead>
          <tr>
            <SortHeader label="Automation" column="name" sort={sort} onSort={onSort} />
            <SortHeader label="Replies sent" column="sent" sort={sort} onSort={onSort} numeric />
            <SortHeader label="Failed" column="failed" sort={sort} onSort={onSort} numeric />
            <SortHeader label="Delivered" column="rate" sort={sort} onSort={onSort} numeric />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.id}>
              <th scope="row">
                <div className="ins-automation-cell">
                  <Link href={`/automations/${row.id}/activity`} className="ins-automation-link">
                    <span className="ins-automation-channel" aria-hidden>{row.facebook ? <FacebookGlyph size={15} brand /> : <InstagramGlyph size={15} brand />}</span>
                    <span className="ins-automation-name" title={row.name}>{row.name}</span>
                  </Link>
                  <LocalStatusBadge {...lifecycleStatus(row.status)} />
                </div>
              </th>
              <td className="is-number" data-label="Replies sent">
                <span className="ins-share">
                  <span className="ins-share-bar" aria-hidden><span style={{ width: `${(row.sent / peak) * 100}%` }} /></span>
                  {row.sent.toLocaleString("en-IN")}
                </span>
              </td>
              <td className="is-number" data-label="Failed" data-zero={row.failed === 0 ? "" : undefined}>{row.failed.toLocaleString("en-IN")}</td>
              <td className="is-number" data-label="Delivered">{row.rate === null ? "–" : `${row.rate}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Journey({ journey }: { journey: JourneyCounts }) {
  const steps = journeySteps(journey);
  const top = Math.max(1, steps[0].count);
  const drop = biggestDrop(steps);
  if (steps.every((step) => step.count === 0)) {
    // Five rows of zeros said nothing a sentence can't.
    return <p className="ins-empty-copy">Nobody has gone through a comment-to-link flow yet. Each step fills in here as people do.</p>;
  }
  return (
    <>
      <ol className="ins-journey">
        {steps.map((step) => (
          <li key={step.key} data-drop={drop?.step.key === step.key ? "" : undefined}>
            <span className="ins-journey-label">{step.label}</span>
            <span className="ins-journey-bar" aria-hidden><span style={{ width: `${(step.count / top) * 100}%` }} /></span>
            <strong>{step.count.toLocaleString("en-IN")}</strong>
            <small>{step.kept === null ? "" : `${step.kept}% kept`}</small>
          </li>
        ))}
      </ol>
      {drop ? <p className="ins-hint">{drop.sentence}</p> : null}
    </>
  );
}

function TopPosts({ posts, media }: { posts: MediaPerformance[]; media: Map<string, MediaInfo> }) {
  if (posts.length === 0) return <p className="ins-empty-copy">Posts show up here once an automation matches a comment on them.</p>;
  return (
    <ol className="ins-posts">
      {posts.slice(0, 5).map((post) => {
        const info = media.get(post.mediaId);
        const caption = info?.caption?.trim();
        const rate = post.delivered ? Math.round((post.clicked / post.delivered) * 100) : null;
        const title = caption || (info?.productType === "REELS" ? "Instagram reel" : "Instagram post");
        return (
          <li key={post.mediaId} className="ins-post">
            <span className="ins-post-cover" aria-hidden>
              {/* Meta CDN covers; next/image would need every CDN host configured. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {info?.thumbnailUrl ? <img src={info.thumbnailUrl} alt="" loading="lazy" /> : null}
            </span>
            <span className="ins-post-copy">
              {info?.permalink ? (
                <a href={info.permalink} target="_blank" rel="noreferrer" className="ins-post-title" title={caption}>{title}</a>
              ) : (
                <span className="ins-post-title" title={caption}>{title}</span>
              )}
              <small>
                {plural(post.matched, "comment", "comments")} matched, {plural(post.clicked, "click", "clicks")}
                {rate !== null ? `, ${rate}% clicked` : ""}
              </small>
              {caption ? null : <LocalIdChip id={post.mediaId} label="post ID" />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function InsightsScreen() {
  const [range, setRange] = useState<Range>(14);
  const [automationId, setAutomationId] = useState("");
  const key = cacheKey(range, automationId);
  const [data, setData] = useState<InsightsPayload | null>(() => readCache(cacheKey(14, ""))?.value ?? null);
  // Which filter the numbers on screen belong to; differs from `key` while the next answer loads.
  const [shownKey, setShownKey] = useState<string | null>(() => readCache(cacheKey(14, "")) ? cacheKey(14, "") : null);
  const [error, setError] = useState("");
  const [drawn, setDrawn] = useState(false);
  const [media, setMedia] = useState<Map<string, MediaInfo>>(() => new Map());
  const { automations } = useAutomations();

  const load = useCallback(async (nextRange: Range, nextAutomation: string, signal?: AbortSignal) => {
    const nextKey = cacheKey(nextRange, nextAutomation);
    setError("");
    try {
      const response = await fetch(insightsUrl(nextRange, nextAutomation), { signal });
      const payload = (await response.json().catch(() => ({}))) as Partial<InsightsPayload> & { funnel?: Record<string, number>; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load insights");
      const next: InsightsPayload = {
        journey: payload.journey ?? journeyFromStates(payload.funnel),
        timeseries: {
          days: payload.timeseries?.days ?? nextRange,
          participantsPerDay: payload.timeseries?.participantsPerDay ?? [],
          sentPerDay: payload.timeseries?.sentPerDay ?? [],
        },
        previous: payload.previous,
        automations: payload.automations ?? [],
        mediaPerformance: payload.mediaPerformance ?? [],
        capturedEmails: payload.capturedEmails ?? 0,
        optedOut: payload.optedOut ?? 0,
      };
      insightsCache.set(nextKey, { value: next, fetchedAt: Date.now(), fetcher: fetch });
      setData(next);
      setShownKey(nextKey);
    } catch (caught: unknown) {
      if (signal?.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load insights");
      setShownKey(nextKey);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const cached = readCache(key);
    const timer = window.setTimeout(() => {
      if (cached) {
        // Paint the confirmed numbers for this filter at once.
        setData(cached.value);
        setShownKey(key);
        if (Date.now() - cached.fetchedAt < INSIGHTS_FRESH_FOR_MS) return;
      }
      void load(range, automationId, controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key, range, automationId, load]);

  // Captions and covers for the top posts: free from automation snapshots,
  // then one best-effort look at the account's recent media.
  const hasPosts = (data?.mediaPerformance.length ?? 0) > 0;
  useEffect(() => {
    if (!hasPosts) return;
    let active = true;
    fetch("/api/meta/media")
      .then(async (response) => {
        const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ id: string; caption?: string; permalink?: string; thumbnailUrl?: string; mediaUrl?: string; mediaType?: string; mediaProductType?: string }> };
        if (!active || !response.ok || !payload.data) return;
        setMedia(new Map(payload.data.map((item) => [item.id, {
          caption: item.caption,
          permalink: item.permalink,
          thumbnailUrl: item.thumbnailUrl ?? (item.mediaType === "IMAGE" ? item.mediaUrl : undefined),
          productType: item.mediaProductType,
        }])));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [hasPosts]);

  const mediaInfo = useMemo(() => {
    const merged = snapshotMedia(automations);
    for (const [id, info] of media) merged.set(id, { ...merged.get(id), ...info, caption: info.caption ?? merged.get(id)?.caption });
    return merged;
  }, [automations, media]);

  const loading = data === null && !error;
  const refreshing = data !== null && shownKey !== key;
  const days = data?.timeseries.days ?? range;
  const sent = sumPoints(data?.timeseries.sentPerDay ?? []);
  const reached = sumPoints(data?.timeseries.participantsPerDay ?? []);
  const change = periodChange(sent, data?.previous?.sent ?? 0);
  const clicks = (data?.mediaPerformance ?? []).reduce((total, row) => total + row.clicked, 0);

  const rows: AutomationRow[] = useMemo(() => {
    if (!data) return [];
    const outcomes = new Map(data.automations.map((row) => [row.automationId, row]));
    const known = automationId ? automations.filter((automation) => automation.id === automationId) : automations;
    const listed = known.map((automation) => {
      const outcome = outcomes.get(automation.id);
      const sentCount = outcome?.sent ?? 0;
      const failedCount = outcome?.failed ?? 0;
      return {
        id: automation.id,
        name: automation.name,
        status: automation.status,
        facebook: automation.provider === "FACEBOOK" || Boolean(automation.facebookPageId),
        sent: sentCount,
        failed: failedCount,
        rate: sentCount + failedCount > 0 ? Math.round((sentCount / (sentCount + failedCount)) * 100) : null,
      };
    });
    // Drafts that never ran add nothing to a results table.
    return listed.filter((row) => row.sent > 0 || row.failed > 0 || row.status === "ACTIVE");
  }, [data, automations, automationId]);

  const top = rows.reduce<AutomationRow | null>((best, row) => (!best || row.sent > best.sent ? row : best), null);
  const nothingYet = data !== null && sent === 0 && reached === 0 && (data.previous?.sent ?? 0) === 0
    && data.journey.commented === 0 && data.mediaPerformance.length === 0 && data.automations.length === 0;
  const selectedName = automations.find((automation) => automation.id === automationId)?.name;
  const exportHref = automationId ? `/api/insights/export?automationId=${encodeURIComponent(automationId)}` : "/api/insights/export";

  return (
    <div className="page-wrap insights-page ws-page">
      <PageHeader
        className="insights-page-header home-enter"
        title="Insights"
        description="What your automations did, and where people drop off."
        actions={<a className="button button-secondary" href={exportHref} download><Download size={16} aria-hidden /> Export CSV</a>}
      />

      <div className="ins-toolbar home-enter" style={enterStyle(45)}>
        <div className="segmented ins-range" role="group" aria-label="Time range">
          {RANGE_OPTIONS.map((option) => (
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
        <label className="ins-filter">
          <span className="sr-only">Automation</span>
          <select value={automationId} onChange={(event) => setAutomationId(event.target.value)}>
            <option value="">All automations</option>
            {automations.map((automation) => (
              <option key={automation.id} value={automation.id}>{automation.name}</option>
            ))}
          </select>
        </label>
      </div>

      {loading ? <InsightsContentSkeleton /> : null}

      {error && !refreshing ? (
        <section className="surface insights-error" role="alert">
          <h2>Insights didn’t load</h2>
          <p>{error}. Check your connection and try again.</p>
          <button className="button button-secondary" type="button" onClick={() => void load(range, automationId)}><RefreshCw size={15} aria-hidden /> Try again</button>
        </section>
      ) : null}

      {data && !(error && !refreshing) ? (
        <div className="ins-content" data-refreshing={refreshing ? "" : undefined} aria-busy={refreshing}>
          {nothingYet ? (
            <section className="surface ins-empty home-enter" style={enterStyle(90)}>
              <h2>Nothing to show yet</h2>
              <p>
                Once your automations start replying, this page shows replies per day, how far people get from comment to link,
                and which posts bring in the most comments.
              </p>
              {automations.length > 0 ? (
                <Link className="button button-secondary" href="/automations">Check your automations</Link>
              ) : (
                <CreateAutomationButton className="button button-primary"><Plus size={16} aria-hidden /> Create an automation</CreateAutomationButton>
              )}
            </section>
          ) : (
            <>
              <div className="ins-summary home-enter" style={enterStyle(90)}>
                <h2 className="ins-headline" aria-live="polite">{repliesHeadline(change, days)}</h2>
                <p>
                  {selectedName ? `${selectedName}: ` : ""}
                  {repliesSupport({ sent, reached, top: automationId ? null : top })}
                </p>
              </div>

              <section className="surface ins-trend home-enter" aria-label="Replies over time" style={enterStyle(135)}>
                <div className="perf-figures" role="list" aria-label="Performance summary">
                  <PerformanceFigure value={sent} label="Replies sent" tone="primary" delay={25} change={<PeriodChangeNote current={sent} previous={data.previous?.sent} days={days} />} />
                  <PerformanceFigure value={reached} label="People reached" tone="secondary" delay={25} change={<PeriodChangeNote current={reached} previous={data.previous?.reached} days={days} />} />
                  <PerformanceFigure value={clicks} label="Link clicks" delay={25} note="All time, on links sent in DMs" />
                </div>
                <div className="perf-chart" onAnimationEnd={(event) => { if ((event.target as Element).classList.contains("trend-svg")) setDrawn(true); }}>
                  <TrendChart
                    label={`Daily replies sent and people reached for the last ${days} days`}
                    animate={!drawn}
                    maxLabels={days > 14 ? 6 : 7}
                    series={[
                      { key: "sent", label: "replies sent", points: data.timeseries.sentPerDay, tone: "primary" },
                      { key: "reached", label: "people reached", points: data.timeseries.participantsPerDay, tone: "secondary" },
                    ]}
                  />
                </div>
              </section>

              <div className="ins-grid">
                <SectionCard
                  className="ins-journey-card home-enter"
                  style={enterStyle(180)}
                  aria-label="From comment to link"
                  title="From comment to link"
                  description="How far people get in your comment-to-link flows. All time."
                >
                  <Journey journey={data.journey} />
                </SectionCard>
                <SectionCard
                  className="ins-posts-card home-enter"
                  style={enterStyle(225)}
                  aria-label="Top posts"
                  title="Top posts"
                  description="Posts with the most matched comments. All time."
                >
                  <TopPosts posts={data.mediaPerformance} media={mediaInfo} />
                </SectionCard>
              </div>

              {rows.length > 0 ? (
                <SectionCard
                  className="ins-automations home-enter"
                  style={enterStyle(270)}
                  flush
                  aria-label="Automation results"
                  title="Automations"
                  description={`What each one sent in the last ${days} days. Select a column to sort.`}
                >
                  <AutomationTable rows={rows} days={days} />
                </SectionCard>
              ) : null}
            </>
          )}

          <section className="ins-people home-enter" aria-labelledby="ins-people-heading" style={enterStyle(300)}>
            <div>
              <h2 id="ins-people-heading">People you collected</h2>
              <p>Counts your whole workspace, all time, whatever the filters above say.</p>
            </div>
            <dl>
              <div><dt>Emails collected</dt><dd>{data.capturedEmails.toLocaleString("en-IN")}</dd></div>
              <div><dt>Opted out of messages</dt><dd>{data.optedOut.toLocaleString("en-IN")}</dd></div>
            </dl>
            <Link className="text-link" href="/contacts">Open contacts</Link>
          </section>
        </div>
      ) : null}

      <section className="surface ins-links" id="tracked-links" aria-labelledby="tracked-links-heading">
        <TrackedLinksPanel />
      </section>
    </div>
  );
}
