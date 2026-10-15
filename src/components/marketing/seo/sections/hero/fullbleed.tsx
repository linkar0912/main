import Image from "next/image";
import type { SeoPage } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { TrustLockups } from "../../../trust-lockups";
import { seoBreadcrumbs } from "../../seo-layout";
import { triggerLabel } from "../../seo-example";
import { topicVisuals } from "../../seo-theme";
import styles from "./fullbleed.module.css";
import base from "./hero.module.css";
import { HeroActions, HeroBreadcrumb, HeroTitle, HeroWidgets } from "./shared";

/**
 * The page photo edge to edge, a scrim for the copy, and the example floating over the photo.
 * The photo is the likely LCP, so it asks for high fetch priority. Next turns any image without
 * preload or a loading value into loading="lazy", hence the explicit eager. Never preload as well.
 */
export function HeroFullbleed({ page }: { page: SeoPage }) {
  const photo = seoHeroAsset(page);
  return (
    <section className={styles.hero} data-hero="photo" data-hero-variant="fullbleed" data-hero-page={`${page.collection}/${page.slug}`} aria-labelledby="seo-title">
      <div className={styles.media}>
        <div className={styles.photo}>
          <Image src={photo.src} alt={photo.alt} fill fetchPriority="high" loading="eager" sizes="100vw" />
          <span className={styles.scrim} aria-hidden="true" />
        </div>
        <HeroWidgets page={page} look="glass" classes={{ root: styles.widgets, first: styles.first, second: styles.second }} />
      </div>
      <div className={styles.inner}>
        <div className={styles.copy}>
          <HeroBreadcrumb crumbs={seoBreadcrumbs(page)} parentsOnly />
          <HeroTitle text={page.headline} kicker={page.label} className={styles.title} kickerClassName={base.kickerFullbleed} />
          <p className={base.description}>{page.description}</p>
          <HeroActions secondaryHref="#how-it-works" secondaryLabel="See how it works" />
        </div>
        <div className={styles.foot}>
          <TrustLockups className={`${base.trust} ${styles.trust}`} channel={page.topic === "facebook" ? "facebook" : "instagram"} />
          <p className={styles.footNote}>{topicVisuals[page.topic].channel} · {triggerLabel(page)}</p>
        </div>
      </div>
    </section>
  );
}
