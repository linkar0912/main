"use client";

import { ArrowRight, Check, Film, RefreshCw } from "lucide-react";
import { InstagramGlyph } from "./instagram-glyph";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicAutomationTemplates } from "@/src/lib/automation/templates";
import { QuickReelsContentSkeleton } from "./skeleton";
import { PageHeader } from "./page-header";
import { formatDate as formatDateLabel } from "@/src/lib/format-date";

type QuickMedia = {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: "AD" | "FEED" | "REELS" | "STORY";
  permalink: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  timestamp: string;
};

type MediaPage = {
  data?: QuickMedia[];
  paging?: { after?: string };
  error?: string;
};

const REELS_FRESH_FOR_MS = 120_000;
/** /api/meta/media answers 409 when no Instagram account is connected: a setup
 * step, not a failure, so it gets its own calm "connect" state. */
const NOT_CONNECTED = "not_connected";
let reelsCache: { data: QuickMedia[]; after?: string; fetchedAt: number; fetcher: typeof fetch } | undefined;
function readReelsCache() {
  return reelsCache?.fetcher === fetch ? reelsCache : undefined;
}

const commentTemplates = basicAutomationTemplates.filter(
  (template) => template.provider === "INSTAGRAM" && template.surface === "COMMENT",
);

function reelName(reel: QuickMedia): string {
  return reel.caption?.trim() || "Untitled Reel";
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recent Reel";
  // Same en-IN "7 Oct 2026" as every other workspace date.
  return formatDateLabel(date);
}

export function QuickAutomationScreen() {
  const router = useRouter();
  const [reels, setReels] = useState<QuickMedia[]>(() => readReelsCache()?.data ?? []);
  const [selectedId, setSelectedId] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(() => readReelsCache()?.after);
  const [loading, setLoading] = useState(() => !readReelsCache());
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState("");
  const flowStageRef = useRef<HTMLElement>(null);

  const loadPage = useCallback(async (after?: string, signal?: AbortSignal): Promise<{ added: number; after?: string }> => {
    const url = after ? `/api/meta/media?after=${encodeURIComponent(after)}` : "/api/meta/media";
    const response = await fetch(url, { signal });
    const payload = (await response.json().catch(() => ({}))) as MediaPage;
    if (response.status === 409) throw new Error(NOT_CONNECTED);
    if (!response.ok) throw new Error(payload.error ?? "Could not load your Reels");
    if (signal?.aborted) return { added: 0 };
    const nextReels = (payload.data ?? []).filter((media) => media.mediaProductType === "REELS");
    if (!after) reelsCache = { data: nextReels, after: payload.paging?.after, fetchedAt: Date.now(), fetcher: fetch };
    setReels((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const reel of nextReels) byId.set(reel.id, reel);
      return [...byId.values()];
    });
    setCursor(payload.paging?.after);
    setError("");
    return { added: nextReels.length, after: payload.paging?.after };
  }, []);

  useEffect(() => {
    const cached = readReelsCache();
    if (cached && Date.now() - cached.fetchedAt < REELS_FRESH_FOR_MS) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadPage(undefined, controller.signal)
        .catch((caught: unknown) => {
          if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load your Reels");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadPage]);

  const selectedReel = useMemo(() => reels.find((reel) => reel.id === selectedId), [reels, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    flowStageRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [selectedId]);

  async function retry() {
    setLoading(true);
    setError("");
    setReels([]);
    try {
      await loadPage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your Reels");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      // Instagram pages mix Reels with photos and carousels, and returns a
      // next-page cursor even when nothing is left. Keep going (a few pages at
      // most) until new Reels turn up, instead of a click that silently adds
      // nothing and makes the button vanish.
      let next: string | undefined = cursor;
      let added = 0;
      for (let page = 0; page < 5 && next && added === 0; page += 1) {
        ({ added, after: next } = await loadPage(next));
      }
      if (added === 0 && !next) setReachedEnd(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more Reels");
    } finally {
      setLoadingMore(false);
    }
  }

  function openFlow(type: "campaign" | "classic", templateId?: string) {
    if (!selectedId) return;
    const params = new URLSearchParams({ type });
    if (templateId) params.set("template", templateId);
    params.set("media", selectedId);
    router.push(`/automations/new?${params.toString()}`);
  }

  return (
    <>
      <div className="page-wrap quick-automation-page ws-page">
        <PageHeader
          className="quick-automation-header"
          title="Quick automation"
          description="Pick a published Reel, then choose what happens when someone comments on it."
        />

        <section className="surface quick-automation-stage" aria-labelledby="choose-reel-heading">
          <div className="quick-stage-heading">
            <span className="quick-stage-number">1</span>
            <div><h2 id="choose-reel-heading">Choose a Reel</h2><p>Your latest published Reels appear first.</p></div>
          </div>

          {loading && reels.length === 0 ? (
            <QuickReelsContentSkeleton />
          ) : error === NOT_CONNECTED && reels.length === 0 ? (
            <div className="empty-state quick-empty">
              <InstagramGlyph size={24} />
              <h3>Connect Instagram to see your Reels</h3>
              <p>Quick automation starts from a Reel you’ve published, so Linkar needs your Instagram account first.</p>
              <Link className="button button-primary" href="/settings">Connect Instagram</Link>
            </div>
          ) : error && reels.length === 0 ? (
            <div className="empty-state quick-empty">
              <Film size={24} />
              <h3>Your Reels didn’t load</h3>
              <p>{error}</p>
              <div className="empty-actions">
                <button type="button" className="button button-primary" onClick={() => void retry()}><RefreshCw size={15} aria-hidden /> Try again</button>
                <Link className="button button-secondary" href="/settings">Check Instagram connection</Link>
              </div>
            </div>
          ) : reels.length === 0 ? (
            <div className="empty-state quick-empty">
              <Film size={24} />
              <h3>No published Reels yet</h3>
              <p>Publish a Reel on the connected Instagram account, then come back here.</p>
              <Link className="button button-secondary" href="/settings">Check Instagram connection</Link>
            </div>
          ) : (
            <>
              <div className="quick-reel-grid">
                {reels.map((reel) => {
                  const selected = selectedId === reel.id;
                  const title = reelName(reel);
                  const thumbnail = reel.thumbnailUrl ?? reel.mediaUrl;
                  return (
                    <button
                      type="button"
                      className={`quick-reel-card${selected ? " is-selected" : ""}`}
                      aria-label={`Select Reel ${title}`}
                      title={title}
                      aria-pressed={selected}
                      key={reel.id}
                      onClick={() => setSelectedId(reel.id)}
                    >
                      <span className="quick-reel-thumb">
                        {thumbnail
                          ? <img src={thumbnail} alt="" /> // eslint-disable-line @next/next/no-img-element -- Meta CDN thumbnail inside a fixed Reel picker.
                          : <span className="quick-reel-fallback"><Film size={28} /></span>}
                        <span className="quick-reel-type"><Film size={12} /> Reel</span>
                        {selected && <span className="quick-reel-check"><Check size={15} /></span>}
                      </span>
                      <span className="quick-reel-copy"><strong>{title}</strong><small>{formatDate(reel.timestamp)}</small></span>
                    </button>
                  );
                })}
              </div>
              {/* A failed "Load more" keeps the Reels already shown and says so. */}
              {error ? <p className="form-error quick-load-error" role="alert">More Reels didn’t load. Try again.</p> : null}
              {cursor && !reachedEnd ? (
                <button type="button" className="button button-secondary quick-load-more" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? "Loading…" : "Load more Reels"}
                </button>
              ) : reachedEnd ? (
                <p className="muted quick-reels-end">That’s all your Reels ({reels.length}).</p>
              ) : null}
            </>
          )}
        </section>

        {selectedReel && (
          <section ref={flowStageRef} className="surface quick-automation-stage quick-flow-stage" aria-labelledby="choose-flow-heading">
            <div className="quick-stage-heading">
              <span className="quick-stage-number">2</span>
              <div><h2 id="choose-flow-heading">Choose what happens next</h2><p>Each option opens ready for the Reel you selected.</p></div>
            </div>
            <div className="quick-flow-grid">
              <button type="button" className="quick-flow-card is-featured" onClick={() => openFlow("campaign")}>
                <span><strong>Send a link after someone follows you</strong><small>Reply to their comment, ask permission in a message, check that they follow you, then send the link.</small></span>
                <ArrowRight size={18} />
              </button>
              {commentTemplates.map((template) => (
                <button type="button" className="quick-flow-card" key={template.id} onClick={() => openFlow("classic", template.id)}>
                  <span><strong>{template.title}</strong><small>{template.description}</small></span>
                  <ArrowRight size={18} />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
