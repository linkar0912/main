import Link from "next/link";
import { ButtonRoll } from "./button-roll";
import { Reveal } from "./reveal";
import styles from "./final-cta.module.css";

/**
 * The builder's review step, which is the one screen in the product this page
 * had not shown yet - and the right one for a closing CTA, because it is the
 * moment just before a flow goes live. The three readiness lines are what
 * "ready to publish" actually means, rather than three decorative dots.
 */
function PlaneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 4 3 10.6l6.6 2.3M21 4l-6.5 16-3.6-6.4M21 4 9.9 12.9" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

/** A quiet, static conversion moment after the FAQ. */
export function FinalCta() {
  return (
    <section
      id="get-started"
      className={styles.section}
      aria-labelledby="final-cta-title"
      data-reduced-motion-state="visible"
    >
      <div className={styles.frame}>
        <Reveal as="div" className={styles.copy} data-reduced-motion-state="visible">
          <h2 id="final-cta-title" className={styles.title}>
            Give every promising conversation a next step.
          </h2>
          <p className={styles.body}>
            Build your first Linkar flow, publish it with clear rules, and stay close to the moments that need you.
          </p>
          <div className={styles.actions}>
            <Link className={`${styles.action} ${styles.primaryAction}`} href="/signup">
              <ButtonRoll label="Create your flow" />
            </Link>
            <Link className={`${styles.action} ${styles.secondaryAction}`} href="/#how-it-works">
              <ButtonRoll label="See how it works" />
            </Link>
          </div>
        </Reveal>

        <Reveal
          as="figure"
          className={styles.figure}
          aria-label="A Linkar flow ready to publish"
          data-reduced-motion-state="visible"
          delay={80}
        >
          <div className={styles.figureHeader}>
            <span className={styles.figureKicker}>LINKAR FLOW</span>
            <span className={styles.figureStatus}>
              <span className={styles.statusDot} aria-hidden="true" />
              Ready to publish
            </span>
          </div>
          <p className={styles.reviewEyebrow}>Review<i>·</i>Step 05</p>
          <p className={styles.reviewName}>Price list responder</p>

          <div className={styles.commentCard}>
            <span className={styles.cardLabel}>Comment trigger</span>
            <strong>price</strong>
          </div>
          <div className={styles.flowLine} aria-hidden="true" />
          <div className={styles.actionRow}>
            <span className={styles.actionIcon} aria-hidden="true"><PlaneIcon /></span>
            <span className={styles.actionCopy}>
              <span className={styles.actionKind}>Private reply</span>
              <strong>Sends the price list</strong>
            </span>
          </div>

          <ol className={styles.checks}>
            <li><i aria-hidden="true"><TickIcon /></i>Trigger ready</li>
            <li><i aria-hidden="true"><TickIcon /></i>Reply shaped</li>
            <li><i aria-hidden="true"><TickIcon /></i>Handoff clear</li>
          </ol>
          <figcaption>One clear path from signal to useful response.</figcaption>
        </Reveal>
      </div>
    </section>
  );
}
