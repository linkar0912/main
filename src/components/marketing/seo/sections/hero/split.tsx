import Image from "next/image";
import type { SeoPage } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { TrustLockups } from "../../../trust-lockups";
import { seoBreadcrumbs } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import base from "./hero.module.css";
import { HeroActions, HeroBreadcrumb, HeroTitle, HeroWidgets, PORTRAIT_CARD_SIZES } from "./shared";
import styles from "./split.module.css";

/** Accent grid block: copy left, the page photo right with example UI over its edges. */
export function HeroSplit({ page }: { page: SeoPage }) {
  const photo = seoHeroAsset(page);
  return (
    <section className={`${styles.hero} ${shell.accent} ${shell.grid}`} data-hero="photo" data-hero-variant="split" data-hero-page={`${page.collection}/${page.slug}`} aria-labelledby="seo-title">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <HeroBreadcrumb crumbs={seoBreadcrumbs(page)} currentAsPill />
          <HeroTitle text={page.headline} className={styles.title} />
          <p className={base.description}>{page.description}</p>
          <HeroActions secondaryHref="#how-it-works" secondaryLabel="See how it works" />
          <TrustLockups className={base.trust} channel={page.topic === "facebook" ? "facebook" : "instagram"} />
        </div>
        <div className={styles.media}>
          <div className={styles.photo}>
            <Image src={photo.src} alt={photo.alt} fill preload sizes={PORTRAIT_CARD_SIZES} />
          </div>
          <HeroWidgets page={page} look="card" classes={{ first: styles.first, second: styles.second }} />
        </div>
      </div>
    </section>
  );
}
