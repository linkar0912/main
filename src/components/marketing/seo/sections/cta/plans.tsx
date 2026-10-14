import type { SeoPage } from "@/src/content/seo";
import { LinkarMark } from "../../../../linkar-mark";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import { ctaEyebrow, ctaPlans, ctaSub, type CtaTone } from "./copy";
import { CtaActions, CtaHeadline } from "./parts";
import styles from "./plans.module.css";

/** Loud closing block: the headline and actions beside two plan cards from the billing catalog. */
export function CtaPlans({ tone }: { page?: SeoPage; tone: CtaTone }) {
  return (
    <section className={`${shell.section} ${tone === "yellow" ? shell.yellow : shell.hot} ${shell.grid} ${styles.block}`} data-tone={tone} data-cta="plans" aria-labelledby="start-title">
      <div className={`${shell.frame} ${styles.layout}`}>
        <div className={styles.copy}>
          <p className={shell.monoPill}>{ctaEyebrow}</p>
          <CtaHeadline classes={{ title: styles.title, line: styles.line, mark: styles.mark }} />
          <p className={styles.sub}>{ctaSub}</p>
          <CtaActions className={shell.actions} primaryClassName={shell.inkAction} secondaryClassName={shell.outlineAction} />
        </div>
        <ul className={styles.plans} role="list" aria-label="Plans">
          {ctaPlans.map((plan) => (
            <li className={styles.plan} data-plan={plan.key} key={plan.key}>
              <div className={styles.planHead}>
                <span className={styles.planMark} aria-hidden="true"><LinkarMark size={13} /></span>
                <h3 className={styles.planName}>{plan.name}</h3>
                <span className={styles.planTag}>{plan.tag}</span>
              </div>
              <p className={styles.price}><strong>{plan.price}</strong> a month</p>
              <ul className={styles.checks} role="list">
                {plan.checks.map((check) => (
                  <li key={check}><span className={styles.checkIcon} aria-hidden="true"><Icon name="check" size={14} /></span>{check}</li>
                ))}
              </ul>
              {plan.extras.length > 0 ? (
                <ul className={styles.extras} role="list" aria-label={`Also in ${plan.name}`}>
                  {plan.extras.map((extra) => <li key={extra}>{extra}</li>)}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
