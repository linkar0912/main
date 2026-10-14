import { Fragment, type ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import styles from "./banner.module.css";
import { ctaEyebrow, ctaPlans, ctaSub, type CtaTone, type PlanFacts } from "./copy";
import { CtaActions, CtaHeadline } from "./parts";

/**
 * One plan as unbreakable phrases. Each separator stays on the end of its phrase,
 * so a narrow line only ever breaks after a "·", never before one or mid-phrase.
 */
function PlanFactLine({ plan }: { plan: PlanFacts }) {
  const segments: ReactNode[] = [<><strong>{plan.name} {plan.price}</strong> a month</>, ...plan.checks.slice(0, 2)];
  return (
    <span>
      {segments.map((segment, i) => {
        const last = i === segments.length - 1;
        return (
          <Fragment key={i}>
            <span className={styles.seg}>{segment}{last ? null : " ·"}</span>
            {last ? null : " "}
          </Fragment>
        );
      })}
    </span>
  );
}

/** The page accent as a closing band: giant headline, then the offer and the CTA pair over a rule. */
export function CtaBanner({ tone }: { page?: SeoPage; tone: CtaTone }) {
  return (
    <section className={`${shell.section} ${shell.accent} ${shell.grid} ${styles.band}`} data-tone={tone} data-cta="banner" aria-labelledby="start-title">
      <div className={`${shell.frame} ${styles.frame}`}>
        <p className={`${shell.monoPill} ${styles.eyebrow}`}>{ctaEyebrow}</p>
        <span className={styles.badge} aria-hidden="true"><Icon name="sparkle" size={22} />Free to start</span>
        <CtaHeadline classes={{ title: styles.title, line: styles.line, mark: styles.mark }} />
        <div className={styles.foot}>
          <div>
            <p className={styles.sub}>{ctaSub}</p>
            <ul className={styles.facts} role="list" aria-label="Plans">
              {ctaPlans.map((plan) => (
                <li key={plan.key}><PlanFactLine plan={plan} /></li>
              ))}
            </ul>
          </div>
          <CtaActions className={`${shell.actions} ${styles.actions}`} primaryClassName={shell.inverseAction} secondaryClassName={shell.outlineAction} />
        </div>
      </div>
    </section>
  );
}
