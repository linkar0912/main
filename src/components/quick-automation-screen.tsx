"use client";

import { ArrowRight, Check, Film, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { basicAutomationTemplates } from "@/src/lib/automation/templates";
import { AppShell } from "./app-shell";

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

const commentTemplates = basicAutomationTemplates.filter(
  (template) => template.provider === "INSTAGRAM" && template.surface === "COMMENT",
);

function reelName(reel: QuickMedia): string {
  return reel.caption?.trim() || "Untitled Reel";
}

function formatDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "Recent Reel";
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function QuickAutomationScreen() {
  const router = useRouter();
  const [reels, setReels] = useState<QuickMedia[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const flowStageRef = useRef<HTMLElement>(null);

  const loadPage = useCallback(async (after?: string, signal?: AbortSignal) => {
    const url = after ? `/api/meta/media?after=${encodeURIComponent(after)}` : "/api/meta/media";
    const response = await fetch(url, { signal });
    const payload = (await response.json().catch(() => ({}))) as MediaPage;
    if (!response.ok) throw new Error(payload.error ?? "Could not load your Reels");
    const nextReels = (payload.data ?? []).filter((media) => media.mediaProductType === "REELS");
    setReels((current) => {
      const byId = new Map(current.map((item) => [item.id, item]));
      for (const reel of nextReels) byId.set(reel.id, reel);
      return [...byId.values()];
    });
    setCursor(payload.paging?.after);
    setError("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(undefined, controller.signal)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load your Reels");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [loadPage]);

  const selectedReel = useMemo(() => reels.find((reel) => reel.id === selectedId), [reels, selectedId]);

  useEffect(() => {
    if (!selectedReel) return;
    flowStageRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [selectedReel]);

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
      await loadPage(cursor);
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
    <AppShell>
      <div className="page-wrap quick-automation-page">
        <header className="page-header quick-automation-header">
          <div>
            <p className="eyebrow">Quick automation</p>
            <h1>Pick a Reel. Put it to work.</h1>
            <p className="muted page-lede">Choose one published Reel, then choose the reply flow it should run.</p>
          </div>
          <span className="quick-automation-mark" aria-hidden><Sparkles size={22} /></span>
        </header>

        <section className="quick-automation-stage" aria-labelledby="choose-reel-heading">
          <div className="quick-stage-heading">
            <span className="quick-stage-number">1</span>
            <div><h2 id="choose-reel-heading">Choose a Reel</h2><p>Your latest published Reels appear first.</p></div>
          </div>

          {loading ? (
            <div className="quick-reel-grid" aria-label="Loading Reels">
              {[0, 1, 2, 3].map((item) => <div className="quick-reel-skeleton" key={item} aria-hidden />)}
            </div>
          ) : error && reels.length === 0 ? (
            <div className="empty-state quick-empty">
              <Film size={24} />
              <h3>Your Reels could not load.</h3>
              <p>{error}</p>
              <div className="empty-actions">
                <button type="button" className="button button-secondary" onClick={() => void retry()}><RefreshCw size={15} /> Try again</button>
                <a className="button button-primary" href="/settings">Check Instagram connection</a>
              </div>
            </div>
          ) : reels.length === 0 ? (
            <div className="empty-state quick-empty">
              <Film size={24} />
              <h3>No published Reels yet.</h3>
              <p>Publish a Reel on the connected Instagram account, then come back here.</p>
              <a className="button button-secondary" href="/settings">Check Instagram connection</a>
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
                      aria-pressed={selected}
                      key={reel.id}
                      onClick={() => setSelectedId(reel.id)}
                    >
                      <span className="quick-reel-thumb">
                        {thumbnail
                          ? <img src={thumbnail} alt="" />
                          : <span className="quick-reel-fallback"><Film size={28} /></span>}
                        <span className="quick-reel-type"><Film size={12} /> Reel</span>
                        {selected && <span className="quick-reel-check"><Check size={15} /></span>}
                      </span>
                      <span className="quick-reel-copy"><strong>{title}</strong><small>{formatDate(reel.timestamp)}</small></span>
                    </button>
                  );
                })}
              </div>
              {cursor && (
                <button type="button" className="button button-secondary quick-load-more" disabled={loadingMore} onClick={() => void loadMore()}>
                  {loadingMore ? "Loading…" : "Load more Reels"}
                </button>
              )}
            </>
          )}
        </section>

        {selectedReel && (
          <section ref={flowStageRef} className="quick-automation-stage quick-flow-stage" aria-labelledby="choose-flow-heading">
            <div className="quick-stage-heading">
              <span className="quick-stage-number">2</span>
              <div><h2 id="choose-flow-heading">Choose what happens next</h2><p>Each flow opens ready for the Reel you selected.</p></div>
            </div>
            <div className="quick-flow-grid">
              <button type="button" className="quick-flow-card is-featured" onClick={() => openFlow("campaign")}>
                <span><strong>Follow-gated Reel campaign</strong><small>Reply publicly, ask for a DM opt-in, check the follow, then deliver a link.</small></span>
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
    </AppShell>
  );
}
