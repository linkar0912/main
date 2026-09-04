import { InstagramGlyph } from "../instagram-glyph";
import { Reveal } from "./reveal";
import styles from "./before-after-section.module.css";

const manualItems = [
  "Repeat the same answer",
  "Lose context between replies",
  "Remember every follow-up",
  "Spot high intent too late",
] as const;

/** The same three messages on both sides: unanswered on the left, carried
 *  forward on the right. Sample content, the way every preview on this page is. */
const waitingMessages = [
  { from: "@meera.k", text: "price?", waited: "2h" },
  { from: "@arjun.builds", text: "Do you ship to Pune?", waited: "1d" },
  { from: "@nikhil.rr", text: "still available?", waited: "3d" },
] as const;

const queueEvents = [
  "Guide delivered",
  "Goal captured: better leads",
  "Follow-up scheduled",
  "Context ready for a person",
] as const;

export function BeforeAfterSection() {
  return (
    <Reveal
      as="section"
      id="outcomes"
      className={styles.section}
      aria-labelledby="comparison-title"
      data-reduced-motion-state="visible"
    >
      <header>
        <h2 id="comparison-title">Less inbox chasing. More conversations worth joining.</h2>
      </header>
      <div className={styles.comparison}>
        <article className={styles.manual} aria-labelledby="manual-title">
          <h3 id="manual-title">Without a system</h3>
          <ul className={styles.waiting} aria-hidden="true">
            {waitingMessages.map((message) => (
              <li key={message.from}>
                <span className={styles.waitingDot} />
                <span className={styles.waitingBody}>
                  <strong>{message.from}</strong>
                  <span>{message.text}</span>
                </span>
                <span className={styles.waitingAge}>{message.waited}</span>
              </li>
            ))}
          </ul>
          <ul>
            {manualItems.map((item, index) => (
              <li key={item} style={{ "--item-index": index } as React.CSSProperties}>
                <span aria-hidden="true" className={styles.check} />{item}
              </li>
            ))}
          </ul>
        </article>
        <div className={styles.divider} data-comparison-divider aria-hidden="true" />
        <article className={styles.linkar} aria-labelledby="linkar-title">
          <h3 id="linkar-title">With Linkar in the loop</h3>
          <figure className={styles.answered} aria-hidden="true">
            <figcaption>
              <span className={styles.answeredAvatar}>M</span>
              <span className={styles.answeredWho}>
                <strong>@meera.k</strong>
                <span>Answered in 4 seconds</span>
              </span>
              <InstagramGlyph size={15} brand />
            </figcaption>
            <p className={styles.answeredIn}>price?</p>
            <p className={styles.answeredOut}>Sent the guide to your DMs. Want the size chart too?</p>
          </figure>
          <ol>
            {queueEvents.map((event, index) => (
              <li key={event} data-current={index === queueEvents.length - 1 || undefined} style={{ "--item-index": index } as React.CSSProperties}>
                <span className={styles.queueNode} aria-hidden="true" />
                <span>{event}</span>
              </li>
            ))}
          </ol>
        </article>
      </div>
      <p className={styles.closing}>Automation handles the repeatable path. Your attention stays available for judgment.</p>
    </Reveal>
  );
}
