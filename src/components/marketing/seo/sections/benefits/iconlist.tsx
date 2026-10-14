import Link from "next/link";
import type { SeoPage } from "@/src/content/seo";
import { seoImageSlot } from "@/src/content/seo/image-slots";
import { ButtonRoll } from "../../../button-roll";
import { SeoImageSlot } from "../../image-slot";
import { Icon } from "../../mock-ui";
import { pageCoin } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import slot from "../slot.module.css";
import { benefitsEyebrow, benefitsSub, benefitsTitle } from "./copy";
import { OutcomeVisual, outcomeIcons } from "./outcome-visual";
import { benefitOutcomes } from "./outcomes";
import styles from "./iconlist.module.css";

const iconTones = [shell.yellow, shell.lilac, shell.pink] as const;

/**
 * A tall photo slot beside the benefits as an icon list (Manychat brands-06).
 * The first benefit's outcome floats on the photo's edge; each icon matches
 * the outcome its benefit describes. The photo side is seeded per page.
 */
export function BenefitsIconlist({ page }: { page: SeoPage }) {
  const outcomes = benefitOutcomes(page);
  return (
    <section className={`${shell.section} ${shell.band}`} id="benefits" aria-labelledby="benefits-title">
      <div className={`${shell.frame} ${styles.layout}`} data-photo={pageCoin(page, "benefits-iconlist") ? "end" : "start"}>
        <div className={styles.media}>
          <div className={styles.photo}>
            <SeoImageSlot className={slot.fill} slot={seoImageSlot({ collection: page.collection, slug: page.slug }, "benefits")} sizes="(min-width: 900px) 40vw, 100vw" />
          </div>
          <div className={styles.float} aria-hidden="true">
            <div className={styles.stage}><OutcomeVisual page={page} kind={outcomes[0]} benefit={page.benefits[0]} /></div>
          </div>
        </div>
        <div className={styles.content}>
          <p className={shell.monoPill}>{benefitsEyebrow}</p>
          <h2 id="benefits-title" className={`${shell.h2} ${styles.title}`}>{benefitsTitle(page)}</h2>
          <p className={shell.sub}>{benefitsSub(page.topic)}</p>
          <ul className={styles.list}>
            {page.benefits.map((benefit, index) => (
              <li key={benefit[0]} className={styles.item}>
                <span className={`${styles.icon} ${iconTones[index % iconTones.length]}`} aria-hidden="true">
                  <Icon name={outcomeIcons[outcomes[index]]} size={22} />
                </span>
                <div>
                  <h3 className={styles.itemTitle}>{benefit[0]}</h3>
                  <p className={`${shell.body} ${styles.itemBody}`}>{benefit[1]}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className={shell.actions}>
            <Link className={shell.primaryAction} href="/signup"><ButtonRoll label="Start for free" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
