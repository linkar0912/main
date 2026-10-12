"use client";

import { useEffect, useMemo, useState } from "react";
import { LocalIdChip } from "./workspace-primitives";
import type { AutomationRecord } from "@/src/lib/repository";
import type { MediaPerformance } from "@/src/lib/automation-analytics";
import { plural } from "@/src/lib/insights-summary";

export type MediaInfo = { caption?: string; permalink?: string; thumbnailUrl?: string; productType?: string };

/** Captions for the posts in "Top posts", free from the automations' own post snapshots. */
export function snapshotMedia(automations: readonly AutomationRecord[]): Map<string, MediaInfo> {
  const media = new Map<string, MediaInfo>();
  for (const automation of automations) {
    const trigger = automation.definition.trigger as { mediaSnapshots?: Array<{ id: string; caption?: string; permalink?: string; mediaProductType?: string }> };
    for (const snapshot of trigger.mediaSnapshots ?? []) {
      media.set(snapshot.id, { caption: snapshot.caption, permalink: snapshot.permalink, productType: snapshot.mediaProductType });
    }
  }
  return media;
}

/**
 * Captions and covers for top posts: the automations' snapshots first, then
 * one best-effort look at the account's recent media (only once there are
 * posts to show).
 */
export function usePostMedia(automations: readonly AutomationRecord[], enabled: boolean): Map<string, MediaInfo> {
  const [media, setMedia] = useState<Map<string, MediaInfo>>(() => new Map());
  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled]);

  return useMemo(() => {
    const merged = snapshotMedia(automations);
    for (const [id, info] of media) merged.set(id, { ...merged.get(id), ...info, caption: info.caption ?? merged.get(id)?.caption });
    return merged;
  }, [automations, media]);
}

/**
 * The posts that brought in the most matched comments, with a cover, the
 * caption (linking to the post) and what came of them. `showDelivered` adds
 * how many people got the link, for an automation's own view.
 */
export function TopPosts({ posts, media, showDelivered = false, emptyText = "Posts show up here once an automation matches a comment on them." }: {
  posts: MediaPerformance[];
  media: Map<string, MediaInfo>;
  showDelivered?: boolean;
  emptyText?: string;
}) {
  if (posts.length === 0) return <p className="ins-empty-copy">{emptyText}</p>;
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
                {showDelivered
                  ? `${plural(post.matched, "comment", "comments")} matched, ${plural(post.delivered, "link", "links")} sent, ${plural(post.clicked, "click", "clicks")}`
                  : <>{plural(post.matched, "comment", "comments")} matched, {plural(post.clicked, "click", "clicks")}{rate !== null ? `, ${rate}% clicked` : ""}</>}
              </small>
              {caption ? null : <LocalIdChip id={post.mediaId} label="post ID" />}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
