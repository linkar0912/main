import Link from "next/link";
import { seoPagePath, seoTopics, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { Icon } from "../mock-ui";
import { seoPager } from "../seo-layout";
import { topicVisuals } from "../seo-theme";
import styles from "./pager.module.css";

const nouns: Record<SeoCollection, string> = { features: "feature", solutions: "solution", templates: "recipe" };

/**
 * Previous and next guide in the collection, wrapping at the ends. A compact
 * strip that closes the related section: only the two neighbours and the
 * position. The related section above already links the hub.
 */
export function SeoPager({ page }: { page: SeoPage }) {
  const { previous, next, position, total } = seoPager(page);
  const noun = nouns[page.collection];
  const links = [
    { dir: "previous", rel: "prev", label: `Previous ${noun}`, target: previous },
    { dir: "next", rel: "next", label: `Next ${noun}`, target: next },
  ] as const;
  return (
    <nav className={styles.pager} aria-labelledby="pager-title">
      <div className={styles.frame}>
        <p id="pager-title" className={styles.count}>
          {noun.charAt(0).toUpperCase() + noun.slice(1)} {position} of {total}
        </p>
        <ul className={styles.links} role="list">
          {links.map(({ dir, rel, label, target }) => (
            <li key={dir} className={styles.item} data-dir={dir}>
              <Link className={styles.link} data-dir={dir} href={seoPagePath(target)} rel={rel} prefetch={false}>
                <span className={styles.dir}>
                  {dir === "previous" ? <Icon name="back" size={16} /> : null}
                  {label}
                  {dir === "next" ? <Icon name="arrow-right" size={16} /> : null}
                </span>
                <strong className={styles.label}>{target.label}</strong>
                <span className={styles.topic}>
                  <span className={styles.dot} style={{ background: topicVisuals[target.topic].accent }} aria-hidden="true" />
                  {seoTopics[target.topic]}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
