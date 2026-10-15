import Image from "next/image";
import type { SeoPage } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { TrustLockups } from "../../../trust-lockups";
import { seoBreadcrumbs } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import styles from "./centered.module.css";
import base from "./hero.module.css";
import { HeroActions, HeroBreadcrumb, HeroTitle, HeroWidgets } from "./shared";

/**
 * Centred copy on the accent block, then the photo in stacked tilted frames with a two-step example.
 * The photo starts at or below the fold, so it loads eagerly without a head preload competing with the CSS and fonts.
 */
export function HeroCentered({ page }: { page: SeoPage }) {
  const photo = seoHeroAsset(page);
  return (
    <section className={`${styles.hero} ${shell.accent} ${shell.grid}`} data-hero="photo" data-hero-variant="centered" data-hero-page={`${page.collection}/${page.slug}`} aria-labelledby="seo-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <HeroBreadcrumb crumbs={seoBreadcrumbs(page)} parentsOnly className={styles.crumbs} />
          <HeroTitle text={page.headline} kicker={page.label} className={styles.title} kickerClassName={base.kickerCentered} />
          <p className={`${base.description} ${styles.description}`}>{page.description}</p>
          <HeroActions secondaryHref="#how-it-works" secondaryLabel="See how it works" className={styles.actions} />
          <TrustLockups className={`${base.trust} ${styles.trust}`} channel={page.topic === "facebook" ? "facebook" : "instagram"} />
        </div>
        <div className={styles.stage}>
          <div className={styles.box}>
            <div className={styles.frames}>
              <span className={`${styles.back} ${styles.backA}`} aria-hidden="true" />
              <span className={`${styles.back} ${styles.backB}`} aria-hidden="true" />
              <div className={styles.photo}>
                <Image src={photo.src} alt={photo.alt} fill loading="eager" sizes="(min-width: 1260px) 1180px, 100vw" />
              </div>
            </div>
            <HeroWidgets page={page} look="steps" classes={{ first: styles.first, second: styles.second }} />
          </div>
        </div>
      </div>
    </section>
  );
}
