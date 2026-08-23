"use client";

import {
  Bookmark,
  Camera,
  ChevronLeft,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Phone,
  Send,
  Video,
} from "lucide-react";
import { PRODUCT_MARK } from "@/src/lib/branding";

export type PreviewView = "post" | "comments" | "dm";

export type DmBubble = {
  id: string;
  /** "bot" = Linkar's automated message, shown incoming (left, gray) like a real DM from
   * another account. "tap" = a quick-reply button attached to that message, shown as its
   * own right-aligned colored pill — the same visual split Instagram itself uses. */
  from: "bot" | "tap";
  text?: string;
  button?: string;
};

export type InstagramPreviewProps = {
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
  /** Hidden entirely for DM-only triggers (message, referral, optin, first-contact) — there's no post involved. */
  showPost?: boolean;
  /**
   * Hidden for classic private-reply flows — Meta's "reply privately" action delivers a DM,
   * never a public comment, so there's no public reply to show under the post's comments.
   */
  showComments?: boolean;
  username: string;
  postCaption?: string;
  triggerComment?: string;
  commentReply?: string;
  messages: DmBubble[];
};

function PostView({ username, caption }: { username: string; caption?: string }) {
  return (
    <div className="ig-screen">
      <div className="ig-topbar">
        <ChevronLeft size={20} />
        <div className="ig-topbar-title">
          <strong>{username.toUpperCase()}</strong>
          <span>Posts</span>
        </div>
        <span />
      </div>
      <div className="ig-post-header">
        <span className="ig-avatar" />
        <strong>{username}</strong>
      </div>
      <div className="ig-post-media" aria-hidden="true">
        <ImageIcon size={34} strokeWidth={1.3} />
      </div>
      <div className="ig-post-actions">
        <Heart size={22} strokeWidth={1.6} />
        <MessageCircle size={22} strokeWidth={1.6} />
        <Send size={22} strokeWidth={1.6} />
        <span className="ig-spacer" />
        <Bookmark size={22} strokeWidth={1.6} />
      </div>
      <p className="ig-post-caption">{caption ? <><strong>{username}</strong> {caption}</> : <span className="muted">View all comments</span>}</p>
    </div>
  );
}

function CommentsView({ username, triggerComment, commentReply }: { username: string; triggerComment?: string; commentReply?: string }) {
  return (
    <div className="ig-screen ig-screen-comments">
      <div className="ig-topbar">
        <ChevronLeft size={20} />
        <div className="ig-topbar-title"><strong>Comments</strong></div>
        <span />
      </div>
      <div className="ig-comment-list">
        <div className="ig-comment">
          <span className="ig-avatar ig-avatar-sm" />
          <div className="ig-comment-body">
            <strong>someone <span className="ig-comment-time">2m</span></strong>
            <p>{triggerComment || "your keyword"}</p>
            <span className="ig-comment-reply-hint">Reply</span>
          </div>
          <Heart size={13} strokeWidth={1.8} />
        </div>
        <div className="ig-comment ig-comment-nested">
          <span className="ig-avatar ig-avatar-sm ig-avatar-brand">{PRODUCT_MARK}</span>
          <div className="ig-comment-body">
            <strong>{username} <span className="ig-comment-time">now</span></strong>
            <p>{commentReply || "Your public reply appears here"}</p>
            <span className="ig-comment-reply-hint">Reply</span>
          </div>
          <Heart size={13} strokeWidth={1.8} />
        </div>
      </div>
      <div className="ig-comment-input">
        <span className="ig-avatar ig-avatar-sm" />
        <span className="muted">Add a comment…</span>
      </div>
    </div>
  );
}

function DmView({ username, messages }: { username: string; messages: DmBubble[] }) {
  return (
    <div className="ig-screen ig-screen-dm">
      <div className="ig-topbar">
        <ChevronLeft size={20} />
        <span className="ig-avatar ig-avatar-sm" />
        <div className="ig-topbar-title"><strong>{username}</strong></div>
        <span className="ig-spacer" />
        <Phone size={17} strokeWidth={1.8} />
        <Video size={19} strokeWidth={1.8} />
      </div>
      <div className="ig-dm-thread">
        {messages.length === 0 && <p className="ig-dm-empty muted">Your messages will appear here</p>}
        {messages.map((bubble) =>
          bubble.button ? (
            <div className={`ig-dm-button ${bubble.from === "tap" ? "is-tap" : "is-bot"}`} key={bubble.id}>{bubble.button}</div>
          ) : (
            <div className={`ig-dm-bubble ${bubble.from === "tap" ? "is-tap" : "is-bot"}`} key={bubble.id}>{bubble.text}</div>
          ),
        )}
      </div>
      <div className="ig-dm-composer">
        <Camera size={19} strokeWidth={1.8} />
        <span className="muted">Message…</span>
        <ImageIcon size={18} strokeWidth={1.8} />
        <Mic size={18} strokeWidth={1.8} />
      </div>
    </div>
  );
}

/** A believable Instagram UI — post, comments, or DM — so the builder preview shows what a
 * person actually sees, not an abstract chat-bubble mockup. */
export function InstagramPreview({
  view,
  onViewChange,
  showPost = true,
  showComments = true,
  username,
  postCaption,
  triggerComment,
  commentReply,
  messages,
}: InstagramPreviewProps) {
  return (
    <div className="ig-preview">
      <div className="ig-phone">
        {view === "post" && <PostView username={username} caption={postCaption} />}
        {view === "comments" && <CommentsView username={username} triggerComment={triggerComment} commentReply={commentReply} />}
        {view === "dm" && <DmView username={username} messages={messages} />}
      </div>
      <div className="ig-preview-tabs" role="tablist" aria-label="Preview surface">
        {showPost && (
          <button type="button" role="tab" aria-selected={view === "post"} className={view === "post" ? "is-active" : ""} onClick={() => onViewChange("post")}>Post</button>
        )}
        {showComments && (
          <button type="button" role="tab" aria-selected={view === "comments"} className={view === "comments" ? "is-active" : ""} onClick={() => onViewChange("comments")}>Comments</button>
        )}
        <button type="button" role="tab" aria-selected={view === "dm"} className={view === "dm" ? "is-active" : ""} onClick={() => onViewChange("dm")}>DM</button>
      </div>
    </div>
  );
}
