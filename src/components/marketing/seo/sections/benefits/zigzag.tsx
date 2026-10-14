import type { SeoPage } from "@/src/content/seo";
import { seoImageSlot, type ImageSlotKey } from "@/src/content/seo/image-slots";
import { Reveal } from "../../../reveal";
import { SeoImageSlot } from "../../image-slot";
import { pageCoin } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import slot from "../slot.module.css";
import { benefitsEyebrow, benefitsSub, benefitsTitle } from "./copy";
import { OutcomeVisual } from "./outcome-visual";
import { benefitOutcomes } from "./outcomes";
import styles from "./zigzag.module.css";

const slotKeys = ["benefit-1", "benefit-2", "benefit-3"] as const satisfies readonly ImageSlotKey[];
/* The offset frame behind each photo: the page accent, then yellow, then lilac. */
const frameTones = ["accent", "yellow", "lilac"] as const;

/**
 * One row per benefit: a photo slot in a tilted colour frame with the
 * benefit's outcome floating on its corner, beside a large numbered title.
 * Rows alternate sides; the first side is seeded per page. Every slot uses the
 * light placeholder surface, so the rows read as one set in both themes.
 */
export function BenefitsZigzag({ page }: { page: SeoPage }) {
  const outcomes = benefitOutcomes(page);
  const startEnd = pageCoin(page, "benefits-zigzag");
  const total = String(page.benefits.length).padStart(2, "0");
  return (
    <section className={`${shell.section} ${shell.canvas}`} id="benefits" aria-labelledby="benefits-title">
      <div className={shell.frame}>
        <header className={shell.headSplit}>
          <div>
            <p className={shell.monoPill}>{benefitsEyebrow}</p>
            <h2 id="benefits-title" className={shell.h2}>{benefitsTitle(page)}</h2>
          </div>
          <p className={shell.sub}>{benefitsSub(page.topic)}</p>
        </header>
        <ol className={styles.rows}>
          {page.benefits.map((benefit, index) => {
            const key = slotKeys[Math.min(index, slotKeys.length - 1)];
            const frame = frameTones[index % frameTones.length];
            return (
              <Reveal
                as="li"
                key={benefit[0]}
                className={styles.row}
                data-photo={(index % 2 === 0) === startEnd ? "end" : "start"}
                data-frame={frame}
              >
                <div className={styles.media}>
                  <span className={styles.frameBack} aria-hidden="true" />
                  <div className={styles.photo}>
                    <SeoImageSlot className={slot.fill} slot={seoImageSlot({ collection: page.collection, slug: page.slug }, key)} sizes="(min-width: 768px) 48vw, 100vw" surface="light" />
                  </div>
                  <div className={styles.float} aria-hidden="true">
                    <div className={styles.stage}><OutcomeVisual page={page} kind={outcomes[index]} benefit={benefit} /></div>
                  </div>
                </div>
                <div className={styles.text}>
                  <p className={styles.count} aria-hidden="true"><b>{String(index + 1).padStart(2, "0")}</b><span>/ {total}</span></p>
                  <h3 className={styles.title}>{benefit[0]}</h3>
                  <p className={styles.body}>{benefit[1]}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
