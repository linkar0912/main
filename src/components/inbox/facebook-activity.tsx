"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Search } from "lucide-react";
import { SocialAvatar } from "../social-avatar";

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

function mergeItems(current: FacebookActivityItem[], incoming: FacebookActivityItem[]) {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !ids.has(item.id))];
}

export function FacebookActivity() {
  const [items, setItems] = useState<FacebookActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string>();
  const [query, setQuery] = useState("");
  const [page, setPage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  async function load(cursor?: string) {
    if (cursor) setLoadingMore(true);
    const params = new URLSearchParams({ type: "facebook.comment.created", limit: "50" });
    if (cursor) params.set("cursor", cursor);
    try {
      const response = await fetch(`/api/activity?${params}`);
      const payload = (await response.json().catch(() => ({}))) as { data?: { items: FacebookActivityItem[]; nextCursor?: string }; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? "Could not load Facebook activity");
      setItems((current) => cursor ? mergeItems(current, payload.data!.items) : payload.data!.items);
      setNextCursor(payload.data.nextCursor);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load Facebook activity");
    } finally {
      setLoaded(true);
      setLoadingMore(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const pages = useMemo(() => Array.from(new Set(items.map((item) => item.account).filter((value): value is string => Boolean(value)))).sort(), [items]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => (!page || item.account === page) && (!needle || `${item.from ?? ""} ${item.summary ?? ""} ${item.account ?? ""}`.toLowerCase().includes(needle)));
  }, [items, page, query]);

  return <section className="facebook-activity" aria-label="Facebook Page activity">
    <div className="facebook-activity-notice"><MessageCircle size={18} aria-hidden="true" /><p><strong>Public Page activity only.</strong> Facebook Messenger is not enabled.</p></div>
    <div className="facebook-activity-tools">
      <label className="conversation-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search Facebook activity</span><input type="search" aria-label="Search Facebook activity" placeholder="Search comments or people" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <select aria-label="Filter by Facebook Page" value={page} onChange={(event) => setPage(event.target.value)}><option value="">All loaded Pages</option>{pages.map((pageId) => <option key={pageId} value={pageId}>{pageId}</option>)}</select>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loaded ? <p className="muted">Loading Facebook activity…</p> : visible.length === 0 ? <div className="facebook-activity-empty"><MessageCircle size={24} /><p>No Facebook Page comments match this view.</p></div> : <ol className="facebook-activity-list">
      {visible.map((item) => <li key={item.id}>
        <SocialAvatar channel="facebook" name={item.from ?? "Facebook commenter"} src={item.avatarUrl} />
        <div><div className="facebook-activity-topline"><strong>{item.from ?? "Facebook commenter"}</strong><time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time></div><p>{item.summary ?? "Comment received"}</p><small>{item.label}{item.account ? ` · Page ${item.account}` : ""}</small></div>
      </li>)}
    </ol>}
    {nextCursor && <button type="button" className="button button-secondary facebook-load-more" aria-label="Load more Facebook activity" disabled={loadingMore} onClick={() => void load(nextCursor)}>{loadingMore ? "Loading…" : error ? "Retry loading more" : "Load more activity"}</button>}
  </section>;
}
