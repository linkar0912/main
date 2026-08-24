"use client";

import {
  BatteryFull,
  Bookmark,
  Camera,
  ChevronLeft,
  Film,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  Mic,
  Phone,
  Send,
  Signal,
  Video,
  Wifi,
} from "lucide-react";

export type PreviewView = "post" | "comments" | "dm";

export type DmBubble = {
  id: string;
  /** "bot" = Linkar's automated message, shown incoming (left, gray) like a real DM from
   * another account. "tap" = a quick-reply button attached to that message, shown as its
   * own right-aligned colored pill, the same visual split Instagram itself uses. */
  from: "bot" | "tap";
  text?: string;
  button?: string;
  imageUrl?: string;
};

export type InstagramPreviewProps = {
  view: PreviewView;
  onViewChange: (view: PreviewView) => void;
  /** Hidden entirely for DM-only triggers (message, referral, optin, first-contact) - there's no post involved. */
  showPost?: boolean;
  /**
   * Hidden for classic private-reply flows - Meta's "reply privately" action delivers a DM,
   * never a public comment, so there's no public reply to show under the post's comments.
   */
  showComments?: boolean;
  username: string;
  profileId?: string;
  /** The connected account's real profile photo; every "someone else" stays a default no-DP avatar. */
  avatarUrl?: string;
  postCaption?: string;
  postImageUrl?: string;
  /** Reels render at their native 9:16 inside the post view; feed posts stay full-bleed. */
  postIsReel?: boolean;
  triggerComment?: string;
  commentReply?: string;
  messages: DmBubble[];
};

/** Instagram's default no-photo avatar: a quiet circle with a person silhouette. */
function DefaultAvatar({ small = false }: { small?: boolean }) {
  return (
    <span className={`ig-avatar ig-avatar-default${small ? " ig-avatar-sm" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="8.2" r="4.2" />
        <path d="M12 13.6c-4.6 0-8.4 2.5-8.4 5.6 0 .5.4.8.9.8h15c.5 0 .9-.3.9-.8 0-3.1-3.8-5.6-8.4-5.6z" />
      </svg>
    </span>
  );
}

function AccountAvatar({ avatarUrl, small = false }: { avatarUrl?: string; small?: boolean }) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Meta CDN profile photo; next/image adds no value for one remote avatar.
      <img
        className={`ig-avatar ig-avatar-photo${small ? " ig-avatar-sm" : ""}`}
        src={avatarUrl}
        alt=""
      />
    );
  }
  return <DefaultAvatar small={small} />;
}

function PostView({ username, avatarUrl, caption, postImageUrl, postIsReel }: { username: string; avatarUrl?: string; caption?: string; postImageUrl?: string; postIsReel?: boolean }) {
  return (
    <div className="ig-screen">
      <div className="ig-topbar">
        <ChevronLeft size={20} />
        <div className="ig-topbar-title">
          <strong>{username.toUpperCase()}</strong>
          <span>{postIsReel ? "Reels" : "Posts"}</span>
        </div>
        <span />
      </div>
      <div className="ig-post-header">
        <AccountAvatar avatarUrl={avatarUrl} />
        <strong>{username}</strong>
      </div>
      <div className={`ig-post-media${postIsReel ? " is-reel" : ""}`} aria-hidden="true">
        {postImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Meta CDN thumbnail; next/image adds no value for one remote photo.
          <img src={postImageUrl} alt="" />
        ) : postIsReel ? (
          <Film size={34} strokeWidth={1.3} />
        ) : (
          <ImageIcon size={34} strokeWidth={1.3} />
        )}
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

function CommentsView({ username, avatarUrl, triggerComment, commentReply }: { username: string; avatarUrl?: string; triggerComment?: string; commentReply?: string }) {
  return (
    <div className="ig-screen ig-screen-comments">
      <div className="ig-topbar">
        <ChevronLeft size={20} />
        <div className="ig-topbar-title"><strong>Comments</strong></div>
        <span />
      </div>
      <div className="ig-comment-list">
        <div className="ig-comment">
          {/* Someone else commenting: Instagram's default no-photo avatar. */}
          <DefaultAvatar small />
          <div className="ig-comment-body">
            <strong>someone <span className="ig-comment-time">2m</span></strong>
            <p>{triggerComment || "your keyword"}</p>
            <span className="ig-comment-reply-hint">Reply</span>
          </div>
          <Heart size={13} strokeWidth={1.8} />
        </div>
        <div className="ig-comment ig-comment-nested">
          <AccountAvatar avatarUrl={avatarUrl} small />
          <div className="ig-comment-body">
            <strong>{username} <span className="ig-comment-time">now</span></strong>
            <p>{commentReply || "Your public reply appears here"}</p>
            <span className="ig-comment-reply-hint">Reply</span>
          </div>
          <Heart size={13} strokeWidth={1.8} />
        </div>
      </div>
      <div className="ig-comment-input">
        <DefaultAvatar small />
        <span className="muted">Add a comment…</span>
      </div>
    </div>
  );
}

function DmView({ username, avatarUrl, messages }: { username: string; avatarUrl?: string; messages: DmBubble[] }) {
  return (
    <div className="ig-screen ig-screen-dm">
      <div className="ig-topbar">
        <ChevronLeft size={20} />
        <AccountAvatar avatarUrl={avatarUrl} small />
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
          ) : bubble.imageUrl ? (
            <div className={`ig-dm-image ${bubble.from === "tap" ? "is-tap" : "is-bot"}`} key={bubble.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- preview-only thumbnail of the configured image URL */}
              <img src={bubble.imageUrl} alt="" />
            </div>
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

/** A believable Instagram UI inside a phone shell - post, comments, or DM - so the builder
 * preview shows what a person actually sees on their phone, not an abstract mockup. */
export function InstagramPreview({
  view,
  onViewChange,
  showPost = true,
  showComments = true,
  username,
  profileId,
  avatarUrl,
  postCaption,
  postImageUrl,
  postIsReel,
  triggerComment,
  commentReply,
  messages,
}: InstagramPreviewProps) {
  return (
    <div className="ig-preview">
      <div className="ig-device">
        <span className="ig-device-button ig-device-silent" aria-hidden="true" />
        <span className="ig-device-button ig-device-volume" aria-hidden="true" />
        <span className="ig-device-button ig-device-power" aria-hidden="true" />
        <div className="ig-phone">
          <div className="ig-statusbar" aria-hidden="true">
            <span className="ig-statusbar-time">9:41</span>
            <span className="ig-statusbar-island" />
            <span className="ig-statusbar-icons">
              <Signal size={13} strokeWidth={2.2} />
              <Wifi size={13} strokeWidth={2.2} />
              <BatteryFull size={16} strokeWidth={2} />
            </span>
          </div>
          {view === "post" && (
            <PostView
              username={username}
              avatarUrl={avatarUrl}
              caption={postCaption}
              postImageUrl={postImageUrl}
              postIsReel={postIsReel}
            />
          )}
          {view === "comments" && <CommentsView username={username} avatarUrl={avatarUrl} triggerComment={triggerComment} commentReply={commentReply} />}
          {view === "dm" && <DmView username={username} avatarUrl={avatarUrl} messages={messages} />}
          <div className="ig-homebar" aria-hidden="true" />
        </div>
      </div>
      <p className="ig-profile-meta">
        <span className="ig-profile-app">Instagram</span>
        <span className="ig-profile-updated"><span className="ig-updated-dot" /> Updated</span>
        <span className="ig-profile-id">@{username}{profileId ? ` - ID ${profileId}` : ""}</span>
      </p>
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
