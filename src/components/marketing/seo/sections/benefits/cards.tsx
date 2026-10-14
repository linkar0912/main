import type { SeoPage } from "@/src/content/seo";
import { Reveal } from "../../../reveal";
import shell from "../../seo-section.module.css";
import { benefitsEyebrow, benefitsSub, benefitsTitle } from "./copy";
import { OutcomeVisual } from "./outcome-visual";
import { benefitOutcomes } from "./outcomes";
import styles from "./cards.module.css";

/* Lilac, mint and pink: the overview's yellow pile never repeats right below it. */
const panelTones = [shell.lilac, shell.mint, shell.pink] as const;

/** Two or three colour cards on a band, each with the outcome its benefit describes. */
export function BenefitsCards({ page }: { page: SeoPage }) {
  const outcomes = benefitOutcomes(page);
  return (
    <section className={`${shell.section} ${shell.band}`} id="benefits" aria-labelledby="benefits-title">
      <div className={shell.frame}>
        <header className={shell.head}>
          <p className={shell.monoPill}>{benefitsEyebrow}</p>
          <h2 id="benefits-title" className={shell.h2}>{benefitsTitle(page)}</h2>
          <p className={shell.sub}>{benefitsSub(page.topic)}</p>
        </header>
        <div className={styles.grid} data-count={page.benefits.length}>
          {page.benefits.map((benefit, index) => (
            <Reveal as="article" className={styles.card} key={benefit[0]} delay={index * 90}>
              <div className={`${styles.panel} ${panelTones[index % panelTones.length]} ${shell.grid} ${shell.panel}`} aria-hidden="true">
                <div className={styles.stage}><OutcomeVisual page={page} kind={outcomes[index]} benefit={benefit} /></div>
              </div>
              <h3 className={`${shell.h3} ${styles.title}`}>{benefit[0]}</h3>
              <p className={`${shell.body} ${styles.text}`}>{benefit[1]}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
