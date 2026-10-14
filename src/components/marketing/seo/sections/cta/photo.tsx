import type { SeoPage } from "@/src/content/seo";
import { seoImageSlot } from "@/src/content/seo/image-slots";
import { LinkarMark } from "../../../../linkar-mark";
import { SeoImageSlot } from "../../image-slot";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import slot from "../slot.module.css";
import { ctaEyebrow, ctaPlans, ctaSub, type CtaTone } from "./copy";
import { CtaActions, CtaHeadline } from "./parts";
import styles from "./photo.module.css";

/** The page's closing photo edge to edge, the headline centred on it, and the plans as glass cards. */
export function CtaPhoto({ page, tone }: { page?: SeoPage; tone: CtaTone }) {
  return (
    <section className={`${shell.section} ${styles.section}`} data-tone={tone} data-cta="photo" aria-labelledby="start-title">
      {page ? (
        <div className={styles.media}>
          <SeoImageSlot className={slot.fill} slot={seoImageSlot({ collection: page.collection, slug: page.slug }, "cta")} sizes="100vw" position="50% 45%" />
        </div>
      ) : null}
      <div className={styles.scrim} aria-hidden="true" />

      {page ? (
        <div className={`${styles.glass} ${styles.start}`} aria-hidden="true">
          <span className={styles.startMark}><LinkarMark size={18} /></span>
          <span className={styles.startLabel}>Start with</span>
          <span className={styles.startName}>{page.label}</span>
        </div>
      ) : null}

      <div className={`${shell.frame} ${styles.content}`}>
        <p className={`${shell.monoPill} ${styles.eyebrow}`}>{ctaEyebrow}</p>
        <CtaHeadline classes={{ title: styles.title, line: styles.line, mark: styles.mark }} />
        <p className={styles.sub}>{ctaSub}</p>
        <CtaActions className={`${shell.actions} ${styles.actions}`} primaryClassName={shell.inverseAction} secondaryClassName={`${shell.outlineAction} ${styles.outline}`} />
        <ul className={styles.plans} role="list" aria-label="Plans">
          {ctaPlans.map((plan) => (
            <li className={`${styles.glass} ${styles.plan}`} data-plan={plan.key} key={plan.key}>
              <p className={styles.planHead}><strong>{plan.name}</strong><span>{plan.price}</span><small>a month</small></p>
              <ul className={styles.checks} role="list">
                {plan.checks.map((check) => (
                  <li key={check}><span className={styles.checkIcon} aria-hidden="true"><Icon name="check" size={13} /></span>{check}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
