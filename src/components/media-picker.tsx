"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Film, ImageOff, Layers } from "lucide-react";
import { InstagramGlyph } from "./instagram-glyph";
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

const NOT_CONNECTED = "not_connected";
class NotConnectedError extends Error {
  constructor() {
    super(NOT_CONNECTED);
  }
}

export type MediaPickerProps = {
  selectedIds: string[];
  onChange: (ids: string[], snapshots: MediaSnapshot[]) => void;
  /**
   * Snapshots already known for `selectedIds` before this picker instance has fetched
   * anything - typically the previously saved `mediaSnapshots` when editing an existing
   * campaign. Without this, toggling one item while another selected item lives on a page
   * this picker hasn't fetched yet would silently drop that other item's snapshot.
   */
  initialSnapshots?: MediaSnapshot[];
  /**
   * Optional side channel reporting lightweight display data (thumbnail URL, product type)
   * for every loaded media id. Used by the builder's phone preview; never persisted.
   */
  onIndexChange?: (index: Record<string, { thumbnailUrl?: string; isReel?: boolean }>) => void;
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

export function MediaPicker({ selectedIds, onChange, initialSnapshots = [], onIndexChange }: MediaPickerProps) {
  const [items, setItems] = useState<PickerMedia[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [error, setError] = useState("");
  const itemsById = useRef(new Map<string, PickerMedia>());
  // Seeded once from `initialSnapshots` so a selected item this instance never fetches
  // (e.g. it lives on a later page) still has a snapshot to fall back to when some other
  // item is toggled. Kept up to date as real pages load so the data stays fresh.
  const knownSnapshots = useRef(new Map<string, MediaSnapshot>(initialSnapshots.map((snapshot) => [snapshot.id, snapshot])));
  const reportedSnapshotIds = useRef(new Set(initialSnapshots.map((snapshot) => snapshot.id)));
  const mountedRef = useRef(true);

  async function loadPage(after?: string, isActive: () => boolean = () => true): Promise<number> {
    const url = after ? `/api/meta/media?after=${encodeURIComponent(after)}` : "/api/meta/media";
    const response = await fetch(url);
    const payload = (await response.json().catch(() => ({}))) as {
      data?: PickerMedia[];
      paging?: { after?: string };
      error?: string;
    };
    // 409 means no Instagram account is connected: retrying cannot help, so it
    // becomes a "connect one" state instead of an error.
    if (response.status === 409) throw new NotConnectedError();
    if (!response.ok) throw new Error(payload.error ?? "Could not load your Instagram media");
    if (!isActive()) return 0;
    for (const media of payload.data ?? []) {
      itemsById.current.set(media.id, media);
      knownSnapshots.current.set(media.id, toSnapshot(media));
    }
    // A Reel chosen on the Quick Automation screen reaches this component as
    // an id in the URL, before the builder knows its durable media snapshot.
    // Hydrate that snapshot as soon as its page arrives so saving immediately
    // cannot persist an id with an empty `mediaSnapshots` array.
    const newlyHydrated = selectedIds.filter((id) => knownSnapshots.current.has(id) && !reportedSnapshotIds.current.has(id));
    if (newlyHydrated.length > 0) {
      const snapshots = selectedIds
        .map((id) => knownSnapshots.current.get(id))
        .filter((value): value is MediaSnapshot => Boolean(value));
      newlyHydrated.forEach((id) => reportedSnapshotIds.current.add(id));
      onChange(selectedIds, snapshots);
    }
    setItems([...itemsById.current.values()]);
    setCursor(payload.paging?.after);
    // Instagram returns a cursor even when the next page is empty.
    if (after && (payload.data ?? []).length === 0) setReachedEnd(true);
    return (payload.data ?? []).length;
  }

  useEffect(() => {
    let active = true;
    mountedRef.current = true;
    loadPage(undefined, () => active && mountedRef.current)
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof NotConnectedError ? NOT_CONNECTED : caught instanceof Error ? caught.message : "Could not load your Instagram media");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mountedRef.current = false;
    };
    // Only reload on mount; selection changes must not re-fetch the list.
  // `loadPage` intentionally captures only the mount-time selection. Selection
  // changes must never restart the media request or discard pagination state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Report display-only data (thumbnail URL, reel flag) upward for the phone preview.
  const indexKey = items.map((media) => media.id).join("|");
  useEffect(() => {
    if (!onIndexChange) return;
    const index: Record<string, { thumbnailUrl?: string; isReel?: boolean }> = {};
    for (const [id, media] of itemsById.current) {
      const thumbnailUrl = media.thumbnailUrl ?? media.mediaUrl;
      if (!thumbnailUrl && media.mediaProductType !== "REELS") continue;
      index[id] = {
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(media.mediaProductType === "REELS" ? { isReel: true } : {}),
      };
    }
    onIndexChange(index);
  }, [indexKey, onIndexChange]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setError("");
    try {
      await loadPage(cursor, () => mountedRef.current);
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof NotConnectedError ? NOT_CONNECTED : caught instanceof Error ? caught.message : "Could not load more media");
    } finally {
      if (mountedRef.current) setLoadingMore(false);
    }
  }

  async function retryFirstPage() {
    setLoading(true);
    setError("");
    try {
      await loadPage(undefined, () => mountedRef.current);
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof NotConnectedError ? NOT_CONNECTED : caught instanceof Error ? caught.message : "Could not load your Instagram media");
    } finally {
      if (mountedRef.current) setLoading(false);
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

  if (error === NOT_CONNECTED) {
    return (
      <div className="media-picker media-picker-empty">
        <InstagramGlyph size={20} />
        <p>Connect an Instagram account to pick posts and Reels here.</p>
        <Link className="button button-secondary button-small" href="/settings">Connect Instagram</Link>
      </div>
    );
  }

  // Nothing loaded yet, so there is no grid or selection to keep on screen.
  if (error && items.length === 0) {
    return (
      <div className="media-picker">
        <p className="form-error" role="alert">{error}</p>
        <button type="button" className="button button-secondary button-small" onClick={() => void retryFirstPage()}>Retry</button>
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="muted media-empty">No Instagram media found for this account yet.</p>;
  }

  return (
    <div className="media-picker">
      {/* A failed "Load more" keeps the grid and the selection already made. */}
      {error ? (
        <div className="field-support">
          <p className="form-error" role="alert">{error}</p>
          <button type="button" className="button button-secondary button-small" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? "Retrying…" : "Retry"}
          </button>
        </div>
      ) : null}
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
              className={`media-card ${selected ? "is-selected" : ""} ${media.mediaProductType === "REELS" ? "is-reel" : ""}`}
              onClick={() => toggle(media.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle(media.id);
                }
              }}
            >
              <span className="media-check" aria-hidden="true"><Check size={13} strokeWidth={3} /></span>
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
      {cursor && !reachedEnd ? (
        <button type="button" className="button button-secondary media-load-more" onClick={() => void loadMore()} disabled={loadingMore}>
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      ) : reachedEnd ? (
        <p className="muted quick-reels-end">That’s everything on your account.</p>
      ) : null}
    </div>
  );
}
