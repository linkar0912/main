import Link from "next/link";
import type { CSSProperties } from "react";
import { getRelatedSeoPages, seoPagePath, seoTopics, type SeoPage } from "@/src/content/seo";
import { Reveal } from "../../../reveal";
import { Icon } from "../../mock-ui";
import { PageThumb } from "../../page-thumb";
import shell from "../../seo-section.module.css";
import { seoPalette, seoToneAt, topicVisuals } from "../../seo-theme";
import { browseAllLabel, collectionNames, relatedEyebrow, relatedSub, relatedTitle } from "./copy";
import styles from "./rows.module.css";

/** Hover colours for the rows, in the cards' tone order. */
const rowTones: Record<ReturnType<typeof seoToneAt>, string> = {
  yellow: seoPalette.yellow,
  lilac: seoPalette.lilac,
  pinkTint: seoPalette.pinkTint,
  mint: seoPalette.mint,
  sky: seoPalette.sky,
};

/**
 * Related guides as three full-width rows on the band: index, a miniature of the guide's automation,
 * topic and collection, label, the one-line description, and an arrow that fills
 * as the row lights up in its tone. Each row is one link (the heading's link
 * stretches over it).
 */
export function RelatedRows({ page }: { page: SeoPage }) {
  const related = getRelatedSeoPages(page);
  if (related.length === 0) return null;
  return (
    <section className={`${shell.section} ${shell.band} ${styles.section}`} id="related" aria-labelledby="related-title">
      <div className={shell.frame}>
        <header className={styles.head}>
          <div className={styles.heading}>
            <p className={shell.monoPill}>{relatedEyebrow(related)}</p>
            <h2 id="related-title" className={shell.h2}>{relatedTitle}</h2>
            <p className={`${shell.sub} ${styles.sub}`}>{relatedSub(page, related)}</p>
          </div>
          <Link className={styles.browse} href={`/${page.collection}`}>
            <span>{browseAllLabel(page.collection)}</span>
            <span className={styles.browseIcon} aria-hidden="true"><Icon name="arrow-right" size={18} /></span>
          </Link>
        </header>
        <ol className={styles.rows} role="list">
          {related.map((item, index) => {
            const accent = topicVisuals[item.topic].accent;
            return (
              <Reveal as="li" className={styles.item} delay={index * 70} key={seoPagePath(item)}>
                <article className={styles.row} style={{ "--row-tone": rowTones[seoToneAt(index)] } as CSSProperties}>
                  <span className={styles.index} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                  {/* The same miniature as the guide's card on the hub and in the related cards, at row size. */}
                  <div className={styles.thumb} aria-hidden="true">
                    <PageThumb page={item} size="row" />
                  </div>
                  <div className={styles.main}>
                    <p className={styles.meta}>
                      <span className={styles.dot} style={{ background: accent }} aria-hidden="true" />
                      <span className={styles.topic}>{seoTopics[item.topic]}</span>
                      <span className={styles.kind}>{collectionNames[item.collection]}</span>
                    </p>
                    <h3 className={styles.label}>
                      <Link className={styles.link} href={seoPagePath(item)} prefetch={false}>{item.label}</Link>
                    </h3>
                    <p className={styles.description}>{item.description}</p>
                  </div>
                  <span className={styles.go} aria-hidden="true"><Icon name="arrow-right" size={22} /></span>
                </article>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
