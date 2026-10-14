import type { SeoPage } from "@/src/content/seo";
import { Icon, MockAvatar, MockBubble, MockComment, MockLinkButton, MockNextContent, MockPageAvatar, MockPublicComment, MockSystemLine } from "../../mock-ui";
import { eventLine, exampleHandle, incomingFor, nextFor, nextIsPublic, postCaption, replyFor, type IncomingView, type NextView, type ReplyView } from "../../seo-example";
import shell from "../../seo-section.module.css";
import { exampleHeader, exampleTitle } from "./copy";
import { BrandAvatar, brandHandle, ExampleCaption, exampleContext, Glyph, pageName, ReplyContent, replyName, replyVersions, WorkspaceNote, type ExampleContext } from "./shared";
import styles from "./thread.module.css";

/*
 * The example as two cards on the band: where the request shows up ("Seen
 * this lately?"), then the reply thread. Side by side on wide screens, one
 * column below. Facebook stays in the public comment thread from start to
 * finish; a step for you after the reply sits under the thread, not in it.
 */

type Thread = { page: SeoPage; context: ExampleContext; handle: string; incoming: IncomingView; reply: ReplyView; next: NextView };

/* First card: the request where it shows up. */

function CommentCard({ page, context, handle, incoming }: Thread) {
  const facebook = context === "page";
  return (
    <div className={styles.card} data-kind="comments">
      <div className={styles.creator} aria-hidden="true">
        {facebook ? <MockPageAvatar size={34} /> : <BrandAvatar size={32} />}
        <p><strong>{facebook ? pageName : brandHandle}</strong>{postCaption(page)}</p>
      </div>
      {incoming.kind === "event"
        ? <MockSystemLine className={styles.event}>{eventLine(handle, incoming)}</MockSystemLine>
        : facebook
          ? <MockPublicComment className={styles.publicComment} name={handle} text={incoming.text} meta="Just now · Like · Reply" />
          : <MockComment className={styles.flat} handle={handle} text={incoming.text} time="Now" />}
    </div>
  );
}

function StoryCard({ page, handle, incoming }: Thread) {
  const mention = incoming.kind === "event";
  const owner = mention ? handle : brandHandle;
  return (
    <div className={`${styles.card} ${styles.storyCard}`} data-kind="story">
      <div className={styles.story}>
        <span className={styles.storyBars} aria-hidden="true"><i /><i /><i /></span>
        <p className={styles.storyHead} aria-hidden="true">
          {mention ? <MockAvatar name={owner} size={26} /> : <BrandAvatar size={24} />}
          <strong>{owner}</strong><span>1h</span>
        </p>
        {mention
          ? <span className={styles.mention} aria-hidden="true">@{brandHandle}</span>
          : <span className={styles.sticker} aria-hidden="true">{postCaption(page)}</span>}
        <p className={styles.storyReply}>
          {mention ? <span className={styles.storyReplyHint}>Send message</span> : <span><span className={shell.srOnly}>{handle} replied: </span>{incoming.text}</span>}
          <Icon name="send" size={18} />
        </p>
      </div>
      {mention ? <MockSystemLine className={styles.storyEvent} icon="sparkle">{eventLine(handle, incoming)}</MockSystemLine> : null}
    </div>
  );
}

function InboxCard({ page, handle, incoming }: Thread) {
  const rows = [
    { name: handle, text: incoming.text, unread: true },
    { name: exampleHandle(page, 1), text: "Sent 2m ago", unread: false },
    { name: exampleHandle(page, 2), text: "Seen 1h ago", unread: false },
  ];
  return (
    <div className={styles.card} data-kind="inbox">
      <p className={styles.inboxHead} aria-hidden="true"><strong>Messages</strong><span>Requests</span></p>
      <ul className={styles.rows}>
        {rows.map((row) => (
          <li className={styles.row} data-unread={row.unread ? "true" : undefined} key={row.name}>
            <MockAvatar name={row.name} size={40} />
            <p>
              <strong>{row.name}</strong>
              <span>{row.text}</span>
            </p>
            {row.unread ? <span className={styles.unread} aria-hidden="true">now<i /></span> : <Icon name="send" size={16} className={styles.rowIcon} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Second card: the reply thread. Sent messages are bubbles; an automation step is a dashed note. */

function DmCard({ page, context, handle, incoming, reply, next }: Thread) {
  const story = context === "story";
  const mention = story && incoming.kind === "event";
  const label = context === "post" ? "Commented on your post" : mention ? "Mentioned you in their story" : story ? "Replied to your story" : null;
  return (
    <div className={`${styles.card} ${styles.dm}`} data-kind="dm">
      <div className={styles.dmHead} aria-hidden="true">
        <Icon name="back" size={18} />
        <MockAvatar name={handle} size={30} />
        <p><strong>{handle}</strong><span>Instagram</span></p>
        <Glyph name="video" size={20} />
      </div>
      <div className={styles.dmBody}>
        {incoming.kind === "event" && !mention ? (
          <MockSystemLine className={styles.event}>{eventLine(handle, incoming)}</MockSystemLine>
        ) : (
          <div className={styles.them}>
            <MockAvatar name={handle} size={26} />
            <div>
              {label ? <p className={styles.label}>{label}</p> : null}
              {mention
                ? <span className={styles.storyShare} aria-hidden="true"><span className={styles.storyShareBars}><i /><i /></span><span className={styles.storyShareSticker}>@{brandHandle}</span></span>
                : <p className={styles.themBubble}><span className={shell.srOnly}>{handle}: </span>{incoming.text}</p>}
            </div>
          </div>
        )}
        <div className={styles.you}>
          <span className={shell.srOnly}>{replyName(page)}: </span>
          <ReplyContent page={page} reply={reply} />
          {next.kind === "button" ? <MockLinkButton className={styles.button}>{next.label}</MockLinkButton> : null}
        </div>
        {next.kind === "later" ? (
          <>
            <MockSystemLine className={styles.later} icon="clock">{next.label}:</MockSystemLine>
            <div className={styles.you}><MockBubble side="you">{next.quoted}</MockBubble></div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PublicReplyCard({ page, handle, incoming, reply, next }: Thread) {
  const texts = reply.kind === "variants" ? replyVersions(page, reply).map((version) => `${version.tag} ${version.text}`) : [reply.text];
  return (
    <div className={`${styles.card} ${styles.dm}`} data-kind="public">
      <div className={styles.dmHead} aria-hidden="true">
        <Icon name="back" size={18} />
        <MockPageAvatar size={30} />
        <p><strong>Comments</strong><span>{pageName} · Public post</span></p>
      </div>
      <div className={styles.dmBody}>
        {incoming.kind === "event"
          ? <MockSystemLine className={styles.event}>{eventLine(handle, incoming)}</MockSystemLine>
          : <MockPublicComment name={handle} text={incoming.text} meta="2m · Like · Reply" quiet />}
        {texts.map((text) => (
          <div className={styles.pageReply} key={text}>
            <MockPublicComment name={pageName} author text={<><span className={shell.srOnly}>Public reply: </span>{text}</>} />
          </div>
        ))}
        {nextIsPublic(next) ? <MockNextContent next={next} className={styles.next} /> : null}
      </div>
    </div>
  );
}

export function ExampleThread({ page }: { page: SeoPage }) {
  const thread: Thread = {
    page,
    context: exampleContext(page),
    handle: exampleHandle(page),
    incoming: incomingFor(page),
    reply: replyFor(page),
    next: nextFor(page),
  };
  const facebook = thread.context === "page";
  const first = thread.context === "story" ? <StoryCard {...thread} />
    : thread.context === "inbox" ? <InboxCard {...thread} />
    : <CommentCard {...thread} />;
  // A note the person never sees (a step for you) sits under the thread.
  const workspaceNote = thread.next.kind === "note" && !nextIsPublic(thread.next) ? thread.next.label : null;
  return (
    <section className={`${shell.section} ${shell.band} ${styles.section}`} id="example" aria-labelledby="conversation-title">
      <div className={shell.frame}>
        <header className={shell.head}>
          <p className={shell.monoPill}>{exampleHeader.eyebrow}</p>
          <h2 id="conversation-title" className={shell.h2}>{exampleTitle(page)}</h2>
        </header>
        <figure className={styles.figure}>
          <div className={styles.step}>
            <h3 className={styles.line}>Seen this lately?</h3>
            {first}
          </div>
          <span className={styles.handoff} aria-hidden="true"><Icon name="bolt" size={15} />Linkar replies</span>
          <div className={styles.step}>
            <h3 className={styles.line}>{facebook ? "Then your Page answers in public." : "Then the reply lands."}</h3>
            {facebook ? <PublicReplyCard {...thread} /> : <DmCard {...thread} />}
            {workspaceNote ? <WorkspaceNote className={styles.workspace}>{workspaceNote}</WorkspaceNote> : null}
          </div>
          <ExampleCaption page={page} className={styles.caption} />
        </figure>
      </div>
    </section>
  );
}
