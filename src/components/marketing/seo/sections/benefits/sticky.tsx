import type { CSSProperties } from "react";
import type { SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import { benefitsEyebrow, benefitsSub, benefitsTitle } from "./copy";
import { OutcomeVisual } from "./outcome-visual";
import { benefitOutcomes } from "./outcomes";
import styles from "./sticky.module.css";

/* Accent, yellow, pink: never lilac, so the last card never runs into the lilac flow example that can follow. */
const cardTones = [["accent", shell.accent], ["yellow", shell.yellow], ["pink", shell.pink]] as const;

/**
 * The header holds still on the left while the benefits arrive on the right as
 * tall colour cards that stack over each other (CSS sticky, no script). Phones
 * get a plain column.
 */
export function BenefitsSticky({ page }: { page: SeoPage }) {
  const outcomes = benefitOutcomes(page);
  return (
    <section className={`${shell.section} ${shell.canvas}`} id="benefits" aria-labelledby="benefits-title">
      <div className={`${shell.frame} ${styles.layout}`}>
        <header className={styles.aside}>
          <p className={shell.monoPill}>{benefitsEyebrow}</p>
          <h2 id="benefits-title" className={`${shell.h2} ${styles.title}`}>{benefitsTitle(page)}</h2>
          <p className={shell.sub}>{benefitsSub(page.topic)}</p>
          <ol className={styles.checklist} aria-hidden="true">
            {page.benefits.map(([title]) => (
              <li key={title}><span className={styles.check}><Icon name="check" size={12} /></span>{title}</li>
            ))}
          </ol>
          <div className={shell.actions}>
            <a className={shell.primaryAction} href="/signup"><ButtonRoll label="Start for free" /></a>
          </div>
        </header>
        <ol className={styles.stack}>
          {page.benefits.map((benefit, index) => (
            <li
              key={benefit[0]}
              className={`${styles.card} ${cardTones[index % cardTones.length][1]} ${shell.grid}`}
              data-tone={cardTones[index % cardTones.length][0]}
              style={{ "--card-index": index } as CSSProperties}
            >
              <div className={styles.copy}>
                <span className={styles.number} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <h3 className={styles.cardTitle}>{benefit[0]}</h3>
                <p className={`${shell.body} ${styles.cardBody}`}>{benefit[1]}</p>
              </div>
              <div className={styles.visual} aria-hidden="true">
                <div className={styles.stage}><OutcomeVisual page={page} kind={outcomes[index]} benefit={benefit} /></div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
