"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { SocialAvatar } from "../social-avatar";
import { InlineContentSkeleton } from "../skeleton";
import { getFacebookPages } from "@/src/lib/client/workspace-data";
import { formatDateTime, formatShortDate, formatTime } from "@/src/lib/format-date";

type FacebookActivityItem = {
  id: string;
  channel: "facebook";
  avatarUrl?: string;
  type: string;
  label: string;
  at: string;
  account?: string;
  from?: string;
  summary?: string;
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (date.toDateString() === new Date().toDateString()) return formatTime(date);
  return formatShortDate(date);
}

/** Activity carries Meta's numeric Page ID; people know their Pages by name. */
function pageLabel(pageId: string, names: ReadonlyMap<string, string>): string {
  return names.get(pageId) ?? `Facebook Page ·${pageId.slice(-4)}`;
}

function mergeItems(current: FacebookActivityItem[], incoming: FacebookActivityItem[]) {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !ids.has(item.id))];
}

async function fetchActivityPage(cursor?: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ type: "facebook.comment.created", limit: "50" });
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/activity?${params}`, { signal });
  const payload = (await response.json().catch(() => ({}))) as { data?: { items: FacebookActivityItem[]; nextCursor?: string }; error?: string };
  if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load Facebook activity");
  return payload.data;
}

export function FacebookActivity() {
  const [items, setItems] = useState<FacebookActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [pageNames, setPageNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  const loadAbortRef = useRef<AbortController | null>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => () => loadAbortRef.current?.abort(), []);

  async function load(cursor?: string) {
    if (loadingMoreRef.current) return;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    loadingMoreRef.current = true;
    if (cursor) setLoadingMore(true);
    else {
      // "Try again" after a failed first load: back to the loading state.
      setError("");
      setLoaded(false);
    }
    try {
      const data = await fetchActivityPage(cursor, controller.signal);
      if (controller.signal.aborted) return;
      setItems((current) => cursor ? mergeItems(current, data.items) : data.items);
      setNextCursor(data.nextCursor);
      setError("");
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "Could not load Facebook activity");
    } finally {
      if (!controller.signal.aborted) {
        setLoaded(true);
        setLoadingMore(false);
      }
      loadingMoreRef.current = false;
    }
  }

  useEffect(() => {
    let active = true;
    void fetchActivityPage()
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setNextCursor(data.nextCursor);
        setError("");
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : "Could not load Facebook activity");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    void getFacebookPages()
      .then((connected) => {
        if (active) setPageNames(new Map(connected.map((entry) => [entry.pageId, entry.pageName])));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  const pages = useMemo(() => Array.from(new Set(items.map((item) => item.account).filter((value): value is string => Boolean(value))))
    .sort((a, b) => pageLabel(a, pageNames).localeCompare(pageLabel(b, pageNames))), [items, pageNames]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (!page || item.account === page) && (!needle || `${item.from ?? ""} ${item.summary ?? ""} ${item.account ? pageLabel(item.account, pageNames) : ""}`.toLowerCase().includes(needle)));
  }, [items, page, pageNames, query]);
  const firstLoadFailed = Boolean(error) && items.length === 0;

  return <section className="ibx-fb" aria-label="Facebook Page activity">
    <header className="ibx-fb-head">
      <div className="ibx-list-title"><h2>Page comments</h2><span>{loaded ? `${visible.length.toLocaleString()} loaded` : "Loading"}</span></div>
      <p className="ibx-fb-note"><MessageCircle size={15} aria-hidden="true" /><span><strong>Public comments only.</strong> Facebook Messenger is not enabled, so replies to these go out through your comment automations.</span></p>
    </header>
    <div className="ibx-fb-tools">
      <label className="ibx-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search Facebook activity" placeholder="Search comments or people" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      {pages.length > 1 && <select className="ibx-select" aria-label="Filter by Facebook Page" value={page} onChange={(event) => setPage(event.target.value)}><option value="">All Pages</option>{pages.map((pageId) => <option key={pageId} value={pageId}>{pageLabel(pageId, pageNames)}</option>)}</select>}
    </div>
    {error && <p className="ibx-banner is-error" role="alert">{error}{firstLoadFailed && <button type="button" onClick={() => void load()}>Try again</button>}</p>}
    {!loaded ? <div className="ibx-fb-loading" role="status" aria-label="Loading Facebook activity"><InlineContentSkeleton label="Loading comments" rows={4} /></div> : firstLoadFailed ? null : visible.length === 0 ? <div className="ibx-list-empty"><MessageCircle size={22} aria-hidden="true" /><p>{items.length === 0 ? "No Page comments yet. New comments on your connected Facebook Pages appear here." : "No Facebook Page comments match this view."}</p></div> : <ol className="ibx-fb-list">
      {visible.map((item) => <li key={item.id}>
        <SocialAvatar channel="facebook" name={item.from ?? "Facebook commenter"} src={item.avatarUrl} />
        <div className="ibx-fb-copy">
          <div className="ibx-row-top"><strong>{item.from ?? "Facebook commenter"}</strong><time dateTime={item.at} title={formatDateTime(item.at)}>{formatWhen(item.at)}</time></div>
          <p>{item.summary ?? "Comment received"}</p>
          <small>{item.account ? `On ${pageLabel(item.account, pageNames)}` : item.label}</small>
        </div>
      </li>)}
    </ol>}
    {nextCursor && <button type="button" className="ibx-load-more" aria-label="Load more Facebook activity" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? "Loading…" : error ? "Retry loading more" : "Load more"}</button>}
  </section>;
}
