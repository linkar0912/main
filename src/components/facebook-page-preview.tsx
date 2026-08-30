"use client";

import { useId } from "react";

/**
 * Minimal Page post + nested comment preview used by the automation builder
 * when an automation is pinned to a Facebook Page. We deliberately keep
 * this far smaller than the Instagram preview: Facebook comment-reply v1
 * has a single action (a public nested comment) and no DM/DM-bubble chrome.
 *
 * Visual: a Page header with the page name and avatar, a post body, the
 * original comment, and the bot's nested reply rendered under it. The
 * "Test preview - not sent to Facebook" caption matches the IG preview's
 * contract so the user knows this is local-only.
 */
export type FacebookPagePreviewProps = {
  pageName: string;
  pageAvatarUrl?: string;
  posterName: string;
  postBody: string;
  commentAuthor: string;
  commentText: string;
  replyText: string;
};

export function FacebookPagePreview({
  pageName,
  pageAvatarUrl,
  posterName,
  postBody,
  commentAuthor,
  commentText,
  replyText,
}: FacebookPagePreviewProps) {
  const headingId = useId();
  return (
    <div className="phone-frame" aria-labelledby={headingId}>
      <div className="phone-status">
        <span aria-hidden>9:41</span>
        <span className="phone-status-meta" aria-hidden>5G · 100%</span>
      </div>
      <div className="phone-body facebook-preview">
        <h2 id={headingId} className="phone-only-heading">Test preview</h2>
        <p className="muted phone-preview-caption">Test preview, not sent to Facebook</p>
        <article className="facebook-post">
          <header className="facebook-post-head">
            <span className="facebook-avatar" aria-hidden>
              {pageAvatarUrl
                ? // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; next/image adds no value for one remote photo.
                  <img src={pageAvatarUrl} alt="" />
                : <span className="facebook-avatar-fallback">{pageName.charAt(0).toUpperCase()}</span>}
            </span>
            <div>
              <p className="facebook-page-name">{pageName}</p>
              <p className="facebook-page-meta">Page · 2h</p>
            </div>
          </header>
          <p className="facebook-post-body">{postBody}</p>
          <section className="facebook-comments" aria-label="Comments">
            <div className="facebook-comment">
              <p className="facebook-comment-author">{commentAuthor}</p>
              <p className="facebook-comment-text">{commentText}</p>
              <div className="facebook-nested-reply" role="status">
                <p className="facebook-comment-author">{pageName}</p>
                <p className="facebook-comment-text">{replyText || "Your reply shows up here."}</p>
              </div>
            </div>
          </section>
        </article>
        <p className="muted phone-preview-foot">{posterName ? `Post by ${posterName}. ` : ""}Preview only. Nothing here is sent to Facebook.</p>
      </div>
    </div>
  );
}
