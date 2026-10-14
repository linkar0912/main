import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { seoPagePath, seoTopics, type SeoPage } from "@/src/content/seo";
import { seoImageSlot } from "@/src/content/seo/image-slots";
import { Reveal } from "../../../reveal";
import { SeoImageSlot } from "../../image-slot";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import slot from "../slot.module.css";
import { seoToneAt, topicVisuals, type SeoTone } from "../../seo-theme";
import { collectionNames } from "./copy";
import styles from "./page-card.module.css";

const toneClass: Record<SeoTone, string> = {
  yellow: shell.yellow,
  lilac: shell.lilac,
  pinkTint: shell.pink,
  mint: shell.mint,
  sky: shell.sky,
};

/** The print is 78% of a card on desktop; phones show a 104px thumb. */
const photoSizes = "(min-width: 1024px) 340px, (min-width: 681px) 38vw, 104px";

/** "hub" drops the topic line (the group heading already names it); "related" adds the collection. */
export type SeoPageCardVariant = "default" | "hub" | "related";

/**
 * One guide as a card: a tinted grid panel holding the guide's card image, tilted
 * like a print on a desk, then its topic, label and description. Below 680px it
 * becomes a compact row: thumbnail left, copy right. The heading link stretches
 * over the whole card, so the card is a single link.
 */
export function SeoPageCard({ page, index, variant = "default" }: { page: SeoPage; index: number; variant?: SeoPageCardVariant }) {
  const accent = topicVisuals[page.topic].accent;
  return (
    <article className={styles.card} data-variant={variant} data-tilt={index % 2 === 0 ? "left" : "right"}>
      <div className={`${styles.media} ${toneClass[seoToneAt(index)]}`} aria-hidden="true">
        {/* Placeholders take the guide's own topic colour, so a row of empty slots still reads as different guides. */}
        <div className={styles.photo} style={{ "--seo-accent": accent } as CSSProperties}>
          <SeoImageSlot slot={seoImageSlot({ collection: page.collection, slug: page.slug }, "card")} className={slot.fill} sizes={photoSizes} surface="light" />
        </div>
      </div>
      <div className={styles.copy}>
        {variant === "related" ? (
          <p className={styles.badge}>
            <span className={styles.badgeDot} style={{ background: accent }} aria-hidden="true" />
            {collectionNames[page.collection]}
          </p>
        ) : null}
        {variant === "hub" ? null : (
          <p className={styles.topic}>
            <span className={styles.dot} style={{ background: accent }} aria-hidden="true" />
            {seoTopics[page.topic]}
          </p>
        )}
        <h3 className={styles.title}>
          <Link className={styles.link} href={seoPagePath(page)} prefetch={false}>{page.label}</Link>
        </h3>
        <p className={styles.description}>{page.description}</p>
        <span className={styles.more} aria-hidden="true">Learn more<Icon name="arrow-right" size={16} /></span>
      </div>
    </article>
  );
}

/**
 * Cards that fade up in turn as each row scrolls in. `offset` continues the tone
 * cycle across lists; `after` is one extra list item placed after the cards.
 */
export function SeoPageCardList({ pages, offset = 0, variant, after }: {
  pages: readonly SeoPage[]; offset?: number; variant?: SeoPageCardVariant; after?: ReactNode;
}) {
  return (
    <ul className={styles.list} role="list" data-count={pages.length}>
      {pages.map((page, index) => (
        <Reveal as="li" className={styles.item} delay={(index % 3) * 80} key={seoPagePath(page)}>
          <SeoPageCard page={page} index={offset + index} variant={variant} />
        </Reveal>
      ))}
      {after}
    </ul>
  );
}
