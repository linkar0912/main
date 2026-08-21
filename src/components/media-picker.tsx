"use client";

import { useEffect, useRef, useState } from "react";
import { Film, ImageOff, Layers } from "lucide-react";
import type { MediaSnapshot } from "@/src/lib/automation/types";

type PickerMedia = {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: "AD" | "FEED" | "REELS" | "STORY";
  permalink: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  timestamp: string;
};

export type MediaPickerProps = {
  selectedIds: string[];
  onChange: (ids: string[], snapshots: MediaSnapshot[]) => void;
  /**
   * Snapshots already known for `selectedIds` before this picker instance has fetched
   * anything — typically the previously saved `mediaSnapshots` when editing an existing
   * campaign. Without this, toggling one item while another selected item lives on a page
   * this picker hasn't fetched yet would silently drop that other item's snapshot.
   */
  initialSnapshots?: MediaSnapshot[];
};

function mediaLabel(media: PickerMedia): string {
  if (media.mediaProductType === "REELS") return "Reel";
  if (media.mediaProductType === "STORY") return "Story";
  if (media.mediaProductType === "AD") return "Ad";
  return "Post";
}

function mediaDescription(media: PickerMedia, label: string): string {
  return media.caption?.trim() || `Untitled ${label.toLowerCase()}`;
}

function toSnapshot(media: PickerMedia): MediaSnapshot {
  return {
    id: media.id,
    ...(media.caption === undefined ? {} : { caption: media.caption }),
    mediaType: media.mediaType,
    ...(media.mediaProductType === undefined ? {} : { mediaProductType: media.mediaProductType }),
    permalink: media.permalink,
    timestamp: media.timestamp,
  };
}

export function MediaPicker({ selectedIds, onChange, initialSnapshots = [] }: MediaPickerProps) {
  const [items, setItems] = useState<PickerMedia[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const itemsById = useRef(new Map<string, PickerMedia>());
  // Seeded once from `initialSnapshots` so a selected item this instance never fetches
  // (e.g. it lives on a later page) still has a snapshot to fall back to when some other
  // item is toggled. Kept up to date as real pages load so the data stays fresh.
  const knownSnapshots = useRef(new Map<string, MediaSnapshot>(initialSnapshots.map((snapshot) => [snapshot.id, snapshot])));

  async function loadPage(after?: string) {
    const url = after ? `/api/meta/media?after=${encodeURIComponent(after)}` : "/api/meta/media";
    const response = await fetch(url);
    const payload = (await response.json().catch(() => ({}))) as {
      data?: PickerMedia[];
      paging?: { after?: string };
      error?: string;
    };
    if (!response.ok) throw new Error(payload.error ?? "Could not load your Instagram media");
    for (const media of payload.data ?? []) {
      itemsById.current.set(media.id, media);
      knownSnapshots.current.set(media.id, toSnapshot(media));
    }
    setItems([...itemsById.current.values()]);
    setCursor(payload.paging?.after);
  }

  useEffect(() => {
    let active = true;
    loadPage()
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : "Could not load your Instagram media");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // Only reload on mount; selection changes must not re-fetch the list.
  }, []);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setError("");
    try {
      await loadPage(cursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load more media");
    } finally {
      setLoadingMore(false);
    }
  }

  function toggle(id: string) {
    const nextIds = selectedIds.includes(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id];
    const snapshots = nextIds
      .map((value) => {
        const media = itemsById.current.get(value);
        // Prefer freshly fetched data; fall back to a previously known snapshot for
        // selected items this instance hasn't loaded (see `initialSnapshots`).
        return media ? toSnapshot(media) : knownSnapshots.current.get(value);
      })
      .filter((value): value is MediaSnapshot => Boolean(value));
    onChange(nextIds, snapshots);
  }

  if (loading) {
    return (
      <div className="media-picker" data-testid="media-picker-loading">
        <div className="media-grid">
          {[0, 1, 2, 3].map((key) => (
            <div className="media-skeleton" key={key} aria-hidden="true" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="form-error" role="alert">{error}</p>;
  }

  if (items.length === 0) {
    return <p className="muted media-empty">No Instagram media found for this account yet.</p>;
  }

  return (
    <div className="media-picker">
      <div className="media-grid">
        {items.map((media) => {
          const selected = selectedIds.includes(media.id);
          const label = mediaLabel(media);
          const description = mediaDescription(media, label);
          const thumbnail = media.thumbnailUrl ?? media.mediaUrl;
          return (
            <div
              key={media.id}
              role="checkbox"
              aria-checked={selected}
              tabIndex={0}
              className={`media-card ${selected ? "is-selected" : ""}`}
              onClick={() => toggle(media.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(media.id);
                }
              }}
            >
              <span className="media-thumb">
                {thumbnail ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnail} alt={`${label}: ${description}`} />
                ) : (
                  <span className="media-thumb-fallback" role="img" aria-label={`${label}: ${description} (no preview available)`}>
                    {media.mediaType === "VIDEO" ? (
                      <Film size={20} />
                    ) : media.mediaType === "CAROUSEL_ALBUM" ? (
                      <Layers size={20} />
                    ) : (
                      <ImageOff size={20} />
                    )}
                  </span>
                )}
              </span>
              <span className="media-meta">
                <span className="media-type-label">{label}</span>
                <span className="media-caption">{description}</span>
              </span>
            </div>
          );
        })}
      </div>
      {cursor && (
        <button type="button" className="button button-secondary media-load-more" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
