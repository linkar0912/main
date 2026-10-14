import type { ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import { seoImageSlot, type ImageSlot } from "@/src/content/seo/image-slots";
import { Reveal } from "../../../reveal";
import { SeoImageSlot } from "../../image-slot";
import { Icon, MockAvatar, MockBubble, MockComment, MockNextContent, MockPageAvatar, MockPublicComment, MockSystemLine } from "../../mock-ui";
import { eventLine, exampleHandle, incomingFor, nextFor, nextIsPublic, postCaption, replyFor, type IncomingView, type NextView, type ReplyView } from "../../seo-example";
import shell from "../../seo-section.module.css";
import slot from "../slot.module.css";
import { exampleHeader, exampleTitle } from "./copy";
import styles from "./phone.module.css";
import { BrandAvatar, brandHandle, ExampleCaption, exampleContext, Glyph, pageName, ReplyContent, replyName, replyVersions, WorkspaceNote, type ExampleContext } from "./shared";

type Example = {
  page: SeoPage;
  context: ExampleContext;
  /** The person in the example. */
  handle: string;
  incoming: IncomingView;
  reply: ReplyView;
  next: NextView;
  /** The page's example-post slot: the post or Story the conversation starts from. */
  photo: ImageSlot;
};

function Dots() {
  return <span className={styles.dots}><i /><i /><i /></span>;
}

function Photo({ photo, className }: { photo: ImageSlot; className: string }) {
  return (
    <div className={className}>
      <SeoImageSlot slot={photo} className={slot.fill} sizes="(min-width: 900px) 340px, 80vw" surface="light" />
    </div>
  );
}

/** The request floating over the post: a comment, or a status line when it is an event. */
function IncomingFloat({ handle, incoming, className }: { handle: string; incoming: IncomingView; className: string }) {
  if (incoming.kind === "event") {
    return <p className={`${className} ${styles.eventFloat}`}><MockAvatar name={handle} size={28} /><span><strong>{handle}</strong> {incoming.text}</span></p>;
  }
  return <MockComment className={className} handle={handle} text={incoming.text} time="now" />;
}

/* Left panel: where the conversation starts. Decorative; the phone carries the readable copy. */

function InstagramPost({ page, handle, incoming, photo }: Example) {
  const reel = /\breel\b/i.test(`${page.label} ${page.example.reply}`);
  return (
    <div className={styles.postStage}>
      <div className={styles.card}>
        <div className={styles.postHead}>
          <BrandAvatar />
          <p><strong>{brandHandle}</strong>{reel ? <span>Original audio</span> : null}</p>
          <Dots />
        </div>
        <div className={styles.media}>
          <Photo photo={photo} className={styles.mediaFrame} />
          {reel ? <span className={styles.reelBadge}><Icon name="bolt" size={14} />Reel</span> : null}
          <IncomingFloat className={styles.float} handle={handle} incoming={incoming} />
        </div>
        <div className={styles.postActions}>
          <Icon name="heart" size={22} /><Icon name="comment" size={22} /><Icon name="send" size={22} />
        </div>
        <p className={styles.caption}><strong>{brandHandle}</strong> {postCaption(page)}</p>
      </div>
    </div>
  );
}

function FacebookPost({ page, handle, incoming, photo }: Example) {
  return (
    <div className={styles.postStage}>
      <div className={styles.card}>
        <div className={styles.postHead}>
          <MockPageAvatar />
          <p><strong>{pageName}</strong><span>Just now · Public</span></p>
          <Dots />
        </div>
        <p className={styles.fbCaption}>{postCaption(page)}</p>
        <div className={`${styles.media} ${styles.fbMedia}`}>
          <Photo photo={photo} className={styles.mediaFrame} />
          {incoming.kind === "event"
            ? <IncomingFloat className={styles.float} handle={handle} incoming={incoming} />
            : <div className={`${styles.float} ${styles.fbFloat}`}><MockPublicComment name={handle} text={incoming.text} /></div>}
        </div>
        <div className={styles.fbActions}><span><Glyph name="thumb" size={16} />Like</span><span><Icon name="comment" size={16} />Comment</span><span><Icon name="send" size={16} />Share</span></div>
      </div>
    </div>
  );
}

function StoryContext({ page, handle, incoming, photo }: Example) {
  const theirs = incoming.kind === "event";
  const owner = theirs ? handle : brandHandle;
  return (
    <div className={styles.storyStage}>
      <div className={styles.story}>
        <Photo photo={photo} className={styles.storyPhoto} />
        <span className={styles.storyBars}><i /><i /><i /></span>
        <p className={styles.storyHead}>
          {theirs ? <MockAvatar name={owner} size={26} /> : <BrandAvatar size={26} />}
          <strong>{owner}</strong><span>2h</span>
        </p>
        {theirs
          ? <span className={styles.mention}>@{brandHandle}</span>
          : <span className={styles.storySticker}>{postCaption(page)}</span>}
        <span className={styles.storyReply}>Send message<Icon name="heart" size={18} /></span>
      </div>
      <div className={styles.storyCard}>
        <MockAvatar name={handle} size={30} />
        {theirs ? (
          <p className={styles.storyNote}><strong>{handle}</strong> {incoming.text}</p>
        ) : (
          <div className={styles.storyNote}>
            <p><strong>{handle}</strong> replied to your story</p>
            <MockBubble side="them">{incoming.text}</MockBubble>
          </div>
        )}
      </div>
    </div>
  );
}

function InboxContext({ page, handle, incoming }: Example) {
  const others = [
    { handle: exampleHandle(page, 1), text: "Sent 2m ago" },
    { handle: exampleHandle(page, 2), text: "Seen 1h ago" },
  ];
  return (
    <div className={`${styles.card} ${styles.inbox}`}>
      <div className={styles.inboxTop}>
        <strong>{brandHandle}<Icon name="chevron" size={16} /></strong>
        <Icon name="comment" size={22} />
      </div>
      <div className={styles.search}>Search</div>
      <div className={styles.notes}>
        <span><BrandAvatar size={46} /><small>Your note</small></span>
        {[0, 1, 2].map((index) => {
          const name = exampleHandle(page, index);
          return <span key={name}><MockAvatar name={name} size={50} /><small>{name.split(/[.\s]/)[0]}</small></span>;
        })}
      </div>
      <div className={styles.tabs}><span data-active="true">Messages</span><span>Requests</span></div>
      <ul className={styles.rows}>
        <li className={styles.row} data-unread="true">
          <MockAvatar name={handle} size={44} />
          <p><strong>{handle}</strong><span>{incoming.text}</span></p>
          <span className={styles.rowMeta}>now<i /></span>
        </li>
        {others.map((row) => (
          <li className={styles.row} key={row.handle}>
            <MockAvatar name={row.handle} size={44} />
            <p><strong>{row.handle}</strong><span>{row.text}</span></p>
            <Icon name="send" size={18} className={styles.rowIcon} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Right panel: the conversation itself, as readable text, on a phone that ends on its composer. */

function Phone({ title, subtitle, avatar, actions, composer, children }: {
  title: string; subtitle: string; avatar: ReactNode; actions: ReactNode; composer: ReactNode; children: ReactNode;
}) {
  return (
    <div className={styles.phone}>
      <div className={styles.screen}>
        <div className={styles.chrome} aria-hidden="true">
          <span className={styles.island} />
          <div className={styles.appBar}>
            <Icon name="back" size={18} />
            {avatar}
            <p><strong>{title}</strong><span>{subtitle}</span></p>
            <span className={styles.appBarActions}>{actions}</span>
          </div>
        </div>
        <div className={styles.thread}>{children}</div>
        <div className={styles.composer} aria-hidden="true">{composer}</div>
      </div>
    </div>
  );
}

/** The Story a reply or mention points at, as Instagram previews it in the thread. */
function StoryPreview({ mention }: { mention: boolean }) {
  return (
    <span className={styles.storyPreview} aria-hidden="true">
      <span className={styles.storyPreviewBars}><i /><i /></span>
      {mention ? <span className={styles.storyPreviewSticker}>@{brandHandle}</span> : <span className={styles.storyPreviewOwner} />}
    </span>
  );
}

/** Your post, shared into the DM by the person asking about it: only with a request word from its caption, never with a plain question. */
function SharedPost({ photo }: { photo: ImageSlot }) {
  return (
    <div className={styles.shared} aria-hidden="true">
      <p className={styles.sharedHead}><BrandAvatar size={20} /><strong>{brandHandle}</strong></p>
      <Photo photo={photo} className={styles.sharedPhoto} />
    </div>
  );
}

function DmThread({ handle, context, incoming, reply, next, page, photo }: Example) {
  const story = context === "story";
  const mention = story && incoming.kind === "event";
  const label = context === "post" ? "Commented on your post" : mention ? "Mentioned you in their story" : story ? "Replied to your story" : null;
  return (
    <>
      {context === "post" ? (
        <div className={styles.profile} aria-hidden="true">
          <MockAvatar name={handle} size={56} />
          <span className={styles.profileButton}>View profile</span>
        </div>
      ) : null}
      <MockSystemLine className={styles.day}>Today</MockSystemLine>
      {incoming.kind === "event" && !mention ? (
        <MockSystemLine className={styles.event} icon="bolt">{eventLine(handle, incoming)}</MockSystemLine>
      ) : (
        <div className={styles.in}>
          <MockAvatar name={handle} size={24} />
          <div className={styles.inBody}>
            {label ? <p className={styles.inLabel}>{label}</p> : null}
            {story ? <StoryPreview mention={mention} /> : null}
            {context === "inbox" && incoming.keyword ? <SharedPost photo={photo} /> : null}
            {mention ? <span className={shell.srOnly}>{eventLine(handle, incoming)}</span> : (
              <MockBubble side="them" className={context === "post" ? styles.commentBubble : undefined}>
                <span className={shell.srOnly}>{handle}: </span>{incoming.text}
              </MockBubble>
            )}
          </div>
        </div>
      )}
      <div className={styles.out}>
        <span className={shell.srOnly}>{replyName(page)}: </span>
        <ReplyContent page={page} reply={reply} />
        {next.kind === "button" ? <MockNextContent next={next} className={styles.linkButton} /> : null}
      </div>
      {reply.kind === "quote" && next.kind !== "later" ? <p className={styles.seen} aria-hidden="true">Seen</p> : null}
      {/* A later message lands in the chat; a step for you is shown under the phone instead. */}
      {next.kind === "later" ? <MockNextContent next={next} className={styles.later} /> : null}
    </>
  );
}

/** A Facebook Page post's comments screen: the comment, then the Page's public reply under it. */
function PageThread({ page, handle, incoming, reply, next }: Example) {
  const replies = reply.kind === "variants" ? replyVersions(page, reply).map((version) => `${version.tag} ${version.text}`) : [reply.text];
  return (
    <>
      <div className={styles.fbPostRef} aria-hidden="true">
        <MockPageAvatar size={34} />
        <p><strong>{pageName}</strong><span>{postCaption(page)}</span></p>
      </div>
      <p className={styles.sort} aria-hidden="true">Most relevant<Icon name="chevron" size={14} /></p>
      {incoming.kind === "event"
        ? <MockSystemLine className={styles.event}>{eventLine(handle, incoming)}</MockSystemLine>
        : <MockPublicComment name={handle} text={incoming.text} meta="5m · Like · Reply" />}
      {replies.map((text) => (
        <div className={styles.pageReply} key={text}>
          <MockPublicComment name={pageName} author text={<><span className={shell.srOnly}>Public reply: </span>{text}</>} />
        </div>
      ))}
      {nextIsPublic(next) ? <MockNextContent next={next} className={styles.nextNote} /> : null}
    </>
  );
}

const contextLabels: Record<ExampleContext, string> = { post: "On your post", page: "On your Page post", story: "On your Story", inbox: "In your inbox" };

/** The example as a context panel and a phone: the post, Story or inbox it starts from, then the reply. */
export function ExamplePhone({ page }: { page: SeoPage }) {
  const context = exampleContext(page);
  const incoming = incomingFor(page);
  const example: Example = {
    page,
    context,
    handle: exampleHandle(page),
    incoming,
    reply: replyFor(page),
    next: nextFor(page),
    photo: seoImageSlot({ collection: page.collection, slug: page.slug }, "example-post"),
  };
  const facebook = context === "page";
  const contextLabel = context === "story" && incoming.kind === "event" ? "On their Story" : contextLabels[context];
  // A note the person never sees (a step for you) sits under the phone, not in the chat.
  const workspaceNote = example.next.kind === "note" && !nextIsPublic(example.next) ? example.next.label : null;
  return (
    <section className={`${shell.section} ${shell.canvas} ${styles.section}`} id="example" aria-labelledby="conversation-title">
      <div className={shell.frame}>
        <header className={shell.head}>
          <p className={shell.monoPill}>{exampleHeader.eyebrow}</p>
          <h2 id="conversation-title" className={shell.h2}>{exampleTitle(page)}</h2>
        </header>
        <figure className={styles.figure}>
          <div className={styles.stage}>
            <Reveal className={`${styles.panel} ${styles.contextPanel} ${shell.mint} ${shell.grid} ${shell.panel}`} aria-hidden="true">
              <p className={styles.label}><span>1</span>{contextLabel}</p>
              <div className={styles.contextBody}>
                {context === "post" ? <InstagramPost {...example} />
                  : context === "page" ? <FacebookPost {...example} />
                  : context === "story" ? <StoryContext {...example} />
                  : <InboxContext {...example} />}
              </div>
            </Reveal>
            <span className={styles.connector} aria-hidden="true"><Icon name="bolt" size={15} />Linkar replies<Icon name="arrow-right" size={15} /></span>
            <Reveal className={`${styles.panel} ${styles.replyPanel} ${shell.lilac} ${shell.grid} ${shell.panel}`} delay={120}>
              <p className={styles.label} aria-hidden="true"><span>2</span>{replyName(page)}</p>
              {facebook ? (
                <Phone
                  title="Comments"
                  subtitle={`${pageName} · Public post`}
                  avatar={<MockPageAvatar size={30} />}
                  actions={<Icon name="send" size={18} />}
                  composer={<><MockPageAvatar size={28} /><span className={styles.composerField}>Comment as {pageName}</span><Glyph name="smile" size={20} /></>}
                >
                  <PageThread {...example} />
                </Phone>
              ) : (
                <Phone
                  title={example.handle}
                  subtitle="Instagram"
                  avatar={<MockAvatar name={example.handle} size={30} />}
                  actions={<><Glyph name="phone" size={18} /><Glyph name="video" size={20} /></>}
                  composer={<><span className={styles.camera}><Glyph name="camera" size={16} /></span><span className={styles.composerField}>Message…</span><Glyph name="mic" size={20} /><Icon name="image" size={20} /><Glyph name="smile" size={20} /></>}
                >
                  <DmThread {...example} />
                </Phone>
              )}
              {workspaceNote ? <WorkspaceNote className={styles.workspace}>{workspaceNote}</WorkspaceNote> : null}
            </Reveal>
          </div>
          <ExampleCaption page={page} />
        </figure>
      </div>
    </section>
  );
}
