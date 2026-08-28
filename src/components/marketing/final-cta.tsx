import Link from "next/link";
import { ButtonRoll } from "./button-roll";
import { Reveal } from "./reveal";
import styles from "./final-cta.module.css";

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
          <div className={styles.commentCard}>
            <span className={styles.cardLabel}>COMMENT</span>
            <strong>price</strong>
          </div>
          <div className={styles.flowLine} aria-hidden="true" />
          <ol className={styles.flowSteps}>
            <li>
              <span className={styles.stepDot} aria-hidden="true" />
              <span>Trigger ready</span>
            </li>
            <li>
              <span className={styles.stepDot} aria-hidden="true" />
              <span>Reply shaped</span>
            </li>
            <li>
              <span className={styles.stepDot} aria-hidden="true" />
              <span>Handoff clear</span>
            </li>
          </ol>
          <figcaption>One clear path from signal to useful response.</figcaption>
        </Reveal>
      </div>
    </section>
  );
}
