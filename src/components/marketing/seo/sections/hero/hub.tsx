import Image from "next/image";
import Link from "next/link";
import { getSeoPages, seoCollections, seoPagePath, type SeoCollection } from "@/src/content/seo";
import { seoImageSlot } from "@/src/content/seo/image-slots";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { TrustLockups } from "../../../trust-lockups";
import { SeoImageSlot } from "../../image-slot";
import { Icon } from "../../mock-ui";
import { seoBreadcrumbs } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import { topicShortLabels } from "../../seo-theme";
import base from "./hero.module.css";
import styles from "./hub.module.css";
import { HeroActions, HeroBreadcrumb, HeroTitle, PORTRAIT_CARD_SIZES } from "./shared";

/** The longer name each hub carries in its label pill. */
const hubLabels: Record<SeoCollection, string> = {
  features: "Instagram and Facebook automation features",
  solutions: "Instagram automation for creators and businesses",
  templates: "Instagram and Facebook workflow recipes",
};

/** Copy left; the hub photo right with the collection's first three guides fanned over its edge. */
export function SeoHubHero({ collection }: { collection: SeoCollection }) {
  const hub = seoCollections[collection];
  const photo = seoHeroAsset({ collection });
  const starters = getSeoPages(collection).slice(0, 3);
  return (
    <section className={`${styles.hero} ${shell.accent} ${shell.grid}`} data-hero="photo" data-hero-variant="hub" data-hero-page={collection} aria-labelledby="seo-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <HeroBreadcrumb crumbs={seoBreadcrumbs({ collection })} />
          <p className={`${shell.monoPill} ${base.label}`}>{hubLabels[collection]}</p>
          <HeroTitle text={hub.headline} className={styles.title} />
          <p className={base.description}>{hub.description}</p>
          <HeroActions secondaryHref="#browse" secondaryLabel="Browse all" />
          <TrustLockups className={base.trust} />
        </div>
        <div className={styles.stage}>
          <div className={styles.photo}>
            <Image src={photo.src} alt={photo.alt} fill preload sizes={PORTRAIT_CARD_SIZES} />
          </div>
          <ul className={styles.fan} aria-label={`Start with a ${collection === "templates" ? "recipe" : "guide"}`}>
            {starters.map((page) => (
              <li key={page.slug}>
                <Link className={styles.card} href={seoPagePath(page)}>
                  <SeoImageSlot slot={seoImageSlot({ collection, slug: page.slug }, "card")} sizes="(min-width: 600px) 84px, 64px" className={styles.thumb} surface="light" />
                  <span className={styles.cardText}>
                    <span className={styles.cardTopic}>{topicShortLabels[page.topic]}</span>
                    <span className={styles.cardTitle}>{page.label}</span>
                  </span>
                  <Icon name="arrow-right" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
