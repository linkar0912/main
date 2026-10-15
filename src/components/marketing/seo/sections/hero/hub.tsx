import Image from "next/image";
import Link from "next/link";
import { getSeoPages, seoCollections, seoPagePath, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { TrustLockups } from "../../../trust-lockups";
import { Icon } from "../../mock-ui";
import { PageThumb } from "../../page-thumb";
import { seoBreadcrumbs } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import { topicShortLabels } from "../../seo-theme";
import base from "./hero.module.css";
import styles from "./hub.module.css";
import { HeroActions, HeroBreadcrumb, HeroTitle, PORTRAIT_CARD_SIZES } from "./shared";

/**
 * The longer name each hub carries as its H1 kicker, the label pill that leads
 * the headline. The homepage owns "Instagram automation", so the solutions hub
 * names its audience intent (workflows) instead of competing for that term.
 */
const hubLabels: Record<SeoCollection, string> = {
  features: "Instagram and Facebook automation features",
  solutions: "Instagram workflows for creators and businesses",
  templates: "Instagram and Facebook automation templates",
};

/**
 * The guides the fan starts with: the first guide on each of the collection's
 * first three topics, so the three cards show three different automations
 * (a comment, a DM and a Story reply, say) in three topic colours.
 */
function starterPages(collection: SeoCollection): readonly SeoPage[] {
  const pages = getSeoPages(collection);
  const firsts = pages.filter((page, index) => pages.findIndex((candidate) => candidate.topic === page.topic) === index);
  return (firsts.length >= 3 ? firsts : pages).slice(0, 3);
}

/** Copy left; the hub photo right with a guide from each of three topics fanned over its edge, each with its automation in miniature. */
export function SeoHubHero({ collection }: { collection: SeoCollection }) {
  const hub = seoCollections[collection];
  const photo = seoHeroAsset({ collection });
  const starters = starterPages(collection);
  return (
    <section className={`${styles.hero} ${shell.accent} ${shell.grid}`} data-hero="photo" data-hero-variant="hub" data-hero-page={collection} aria-labelledby="seo-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <HeroBreadcrumb crumbs={seoBreadcrumbs({ collection })} />
          <HeroTitle text={hub.headline} kicker={hubLabels[collection]} className={styles.title} kickerClassName={styles.kicker} />
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
                  <div className={styles.thumb}><PageThumb page={page} size="mini" /></div>
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
