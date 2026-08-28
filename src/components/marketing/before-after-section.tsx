import { Reveal } from "./reveal";
import styles from "./before-after-section.module.css";

const manualItems = [
  "Repeat the same answer",
  "Lose context between replies",
  "Remember every follow-up",
  "Spot high intent too late",
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
