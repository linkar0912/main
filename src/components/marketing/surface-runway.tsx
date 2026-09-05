import { surfaceCards } from "./marketing-content";
import { Reveal } from "./reveal";
import styles from "./surface-runway.module.css";

/**
 * These four cards answer "where does the conversation start?", and the answer
 * is always a specific place inside Instagram. So each preview is a fragment of
 * that actual surface - a comment row, a message thread, a story mention, an
 * opt-in DM - rather than a node-and-arrow diagram that could illustrate any
 * product. The fragments are deliberately cropped: enough to be recognized,
 * not so much that they compete with the card's headline.
 */

function Avatar({ initial, ring = true }: { initial: string; ring?: boolean }) {
  return (
    <span className={styles.avatar} data-ring={ring ? "true" : undefined}>
      <span>{initial}</span>
    </span>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 7.5 6.3Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

/** Comment triggers: the comment, then the private reply landing in the inbox. */
function CommentSurface() {
  return (
    <div className={styles.surface}>
      <div className={styles.surfaceBar}>
        <strong>Comments</strong>
        <span>128</span>
      </div>
      <div className={styles.commentRow}>
        <Avatar initial="G" ring={false} />
        <span className={styles.commentCopy}>
          <span><b>giovanni</b> GUIDE please</span>
          <span className={styles.meta}>2m<i>·</i>1 like<i>·</i>Reply</span>
        </span>
        <span className={styles.heart}><HeartIcon /></span>
      </div>
      <div className={styles.inboxRow}>
        <Avatar initial="L" />
        <span className={styles.commentCopy}>
          <span><b>linkar.studio</b></span>
          <span className={styles.meta}>Here is the guide you asked for</span>
        </span>
        <span className={styles.unread} />
      </div>
    </div>
  );
}

/**
 * Instagram's typing bubble. Incoming side only - Instagram never shows you
 * your own typing.
 */
function TypingBubble() {
  return <span className={styles.typing} aria-hidden="true"><i /><i /><i /></span>;
}

/** DM triggers: an incoming phrase and the reply it shapes. */
function MessageSurface() {
  return (
    <div className={styles.surface} data-thread="true">
      <div className={styles.surfaceBar} data-thread="true">
        <Avatar initial="G" />
        <strong>giovanni</strong>
        <span>Active now</span>
      </div>
      <div className={styles.thread}>
        <TypingBubble />
        <span className={styles.bubbleIn}>Do you ship to Pune?</span>
        <span className={styles.bubbleOut}>Yes - 2 to 4 days across India.</span>
        <span className={styles.chip}>See delivery info</span>
      </div>
    </div>
  );
}

/** Story mentions: the mention notification, answered while it is still warm. */
function MentionSurface() {
  return (
    <div className={styles.surface}>
      <div className={styles.mentionRow}>
        <span className={styles.storyThumb} aria-hidden="true" />
        <span className={styles.commentCopy}>
          <span><b>giovanni</b> mentioned you in their story</span>
          <span className={styles.meta}>2m ago<i>·</i>expires in 22h</span>
        </span>
      </div>
      <div className={styles.thread}>
        <span className={styles.bubbleOut}>Thanks for the shout-out!</span>
      </div>
    </div>
  );
}

/** Follow-gated campaigns: the opt-in tap, then the condition clearing. */
function CampaignSurface() {
  return (
    <div className={styles.surface}>
      <div className={styles.surfaceBar} data-thread="true">
        <Avatar initial="L" />
        <strong>linkar.studio</strong>
      </div>
      <div className={styles.thread}>
        <span className={styles.bubbleIn}>Tap below and I will send the link.</span>
        <span className={styles.optIn}>Send me the link</span>
        <span className={styles.condition}>
          <i><CheckIcon /></i>
          Following<em>·</em>link unlocked
        </span>
      </div>
    </div>
  );
}

const surfaces: Record<string, () => React.JSX.Element> = {
  "comment-triggers": CommentSurface,
  "dm-triggers": MessageSurface,
  "story-mentions": MentionSurface,
  "follow-gated-campaigns": CampaignSurface,
};

function Preview({ id, steps }: { id: string; steps: readonly [string, string, string] }) {
  const Surface = surfaces[id] ?? CommentSurface;
  return (
    <Reveal
      as="figure"
      className={styles.preview}
      aria-label={`${steps.join(" to ")} preview`}
      data-reduced-motion-state="visible"
    >
      <div aria-hidden="true"><Surface /></div>
      {/* The fragment above is decorative; this caption is what a screen reader
          gets, so it stays in the accessibility tree and out of the design. */}
      <figcaption className={styles.srOnly}>{steps.join(" → ")}</figcaption>
    </Reveal>
  );
}

/**
 * A plain two-column grid. This used to be a 320vh scroll-jacked filmstrip that
 * translated the four cards sideways as the page scrolled, which meant that at
 * most scroll positions two cards were sliced in half by the viewport edge - you
 * could never see card one whole. Four cards fit in two rows without hijacking
 * the scrollbar, so they are simply laid out.
 */
export function SurfaceRunway() {
  return (
    <section id="surfaces" className={styles.section} aria-labelledby="surfaces-title">
      <header className={styles.header}>
        <h2 id="surfaces-title">Choose where Linkar should reply.</h2>
        <p>Start with a comment, message, or Story mention and decide exactly what happens next.</p>
      </header>
      <div className={styles.viewport}>
        <ul className={styles.track}>
          {surfaceCards.map((card, index) => (
            <li key={card.id}>
              <article className={styles.card} aria-labelledby={`${card.id}-title`}>
                <span className={styles.cardNumber}>{String(index + 1).padStart(2, "0")}</span>
                <h3 id={`${card.id}-title`}>{card.title}</h3>
                <p className={styles.cardBody}>{card.body}</p>
                <Preview id={card.id} steps={card.preview} />
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
