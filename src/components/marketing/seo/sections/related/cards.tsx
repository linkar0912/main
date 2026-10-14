import Link from "next/link";
import { getRelatedSeoPages, type SeoPage } from "@/src/content/seo";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import styles from "./cards.module.css";
import { browseAllLabel, relatedEyebrow, relatedSub, relatedTitle } from "./copy";
import { SeoPageCardList } from "./page-card";

/** Three guide cards (Manychat's tilted-print grid) under a split header with the browse link. */
export function RelatedCards({ page }: { page: SeoPage }) {
  const related = getRelatedSeoPages(page);
  if (related.length === 0) return null;
  return (
    <section className={`${shell.section} ${shell.canvas} ${styles.section}`} id="related" aria-labelledby="related-title">
      <div className={shell.frame}>
        <header className={`${shell.headSplit} ${styles.head}`}>
          <div>
            <p className={shell.monoPill}>{relatedEyebrow(related)}</p>
            <h2 id="related-title" className={shell.h2}>{relatedTitle}</h2>
          </div>
          <div className={styles.aside}>
            <p className={shell.sub}>{relatedSub(page, related)}</p>
            <Link className={styles.browse} href={`/${page.collection}`}>
              <span>{browseAllLabel(page.collection)}</span>
              <Icon name="arrow-right" size={18} />
            </Link>
          </div>
        </header>
        <SeoPageCardList pages={related} variant="related" />
      </div>
    </section>
  );
}
