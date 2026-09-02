"use client";

import type { CSSProperties } from "react";
import { BatteryFull, Globe2, Heart, MessageCircle, MoreHorizontal, Send, Signal, ThumbsUp, Wifi } from "lucide-react";
import { FacebookGlyph } from "./facebook-glyph";

export type FacebookPagePreviewProps = {
  pageName: string;
  pageAvatarUrl?: string;
  posterName: string;
  postBody: string;
  commentAuthor: string;
  commentText: string;
  replyText: string;
};

function PageAvatar({ pageName, pageAvatarUrl, small = false }: { pageName: string; pageAvatarUrl?: string; small?: boolean }) {
  return (
    <span className={`facebook-avatar${small ? " is-small" : ""}`} aria-hidden="true">
      {pageAvatarUrl
        // eslint-disable-next-line @next/next/no-img-element -- remote Meta avatar inside a fixed preview.
        ? <img src={pageAvatarUrl} alt="" />
        : <span className="facebook-avatar-fallback">{pageName.charAt(0).toUpperCase()}</span>}
    </span>
  );
}

/** A live Facebook Page post preview. It intentionally uses the same premium
 * device treatment as Instagram while rendering Facebook's public comment
 * model: Page post, triggering comment, then the Page's nested reply. */
export function FacebookPagePreview({ pageName, pageAvatarUrl, posterName, postBody, commentAuthor, commentText, replyText }: FacebookPagePreviewProps) {
  return (
    <div className="facebook-preview" style={{ "--facebook-brand": "#1877F2" } as CSSProperties}>
      <div className="facebook-device">
        <span className="facebook-device-button facebook-device-silent" aria-hidden="true" />
        <span className="facebook-device-button facebook-device-volume" aria-hidden="true" />
        <span className="facebook-device-button facebook-device-power" aria-hidden="true" />
        <div className="facebook-phone">
          <div className="facebook-statusbar" aria-hidden="true"><span>9:41</span><span className="facebook-statusbar-island" /><span className="facebook-statusbar-icons"><Signal size={13} /><Wifi size={13} /><BatteryFull size={16} /></span></div>
          <header className="facebook-appbar"><FacebookGlyph size={25} brand /><strong>facebook</strong><span className="facebook-appbar-actions"><span><MessageCircle size={15} /></span><span><MoreHorizontal size={16} /></span></span></header>
          <article className="facebook-post">
            <header className="facebook-post-head">
              <PageAvatar pageName={pageName} pageAvatarUrl={pageAvatarUrl} />
              <div><p className="facebook-page-name">{pageName}</p><p className="facebook-page-meta">2h · <Globe2 size={10} /></p></div>
              <MoreHorizontal className="facebook-post-more" size={17} />
            </header>
            <p className="facebook-post-body">{postBody || "Your Facebook post"}</p>
            <div className="facebook-post-media" aria-hidden="true"><FacebookGlyph size={42} /></div>
            <div className="facebook-engagement"><span><i><ThumbsUp size={9} fill="currentColor" /></i><i><Heart size={9} fill="currentColor" /></i> 24</span><span>3 comments</span></div>
            <div className="facebook-actions" aria-hidden="true"><span><ThumbsUp size={15} /> Like</span><span><MessageCircle size={15} /> Comment</span><span><Send size={15} /> Share</span></div>
            <section className="facebook-comments" aria-label="Comments">
              <div className="facebook-comment-row"><span className="facebook-person-avatar" aria-hidden="true" /><div className="facebook-comment-wrap"><div className="facebook-comment"><p className="facebook-comment-author">{commentAuthor}</p><p className="facebook-comment-text">{commentText || "any comment"}</p></div><span className="facebook-comment-meta">Like · Reply · 1m</span></div></div>
              <div className="facebook-comment-row facebook-nested-reply" role="status"><PageAvatar pageName={pageName} pageAvatarUrl={pageAvatarUrl} small /><div className="facebook-comment-wrap"><div className="facebook-comment is-page"><p className="facebook-comment-author">{pageName} <span className="facebook-page-check">✓</span></p><p className="facebook-comment-text">{replyText || "Your public reply appears here."}</p></div><span className="facebook-comment-meta">Like · Reply · Just now</span></div></div>
            </section>
          </article>
          <div className="facebook-homebar" aria-hidden="true" />
        </div>
      </div>
      <p className="facebook-profile-meta"><span><FacebookGlyph size={14} brand /> Facebook Page</span><span className="facebook-preview-live"><i /> Live preview</span></p>
      <p className="facebook-preview-note">Preview only. Nothing here is sent to Facebook.{posterName ? ` Post by ${posterName}.` : ""}</p>
    </div>
  );
}
