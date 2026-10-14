import Link from "next/link";
import { seoTopics, type SeoPage } from "@/src/content/seo";
import { seoImageSlot } from "@/src/content/seo/image-slots";
import { ButtonRoll } from "../../../button-roll";
import { Reveal } from "../../../reveal";
import { SeoImageSlot } from "../../image-slot";
import { exampleHandle } from "../../seo-example";
import { pageCoin } from "../../seo-layout";
import { topicLine } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import slot from "../slot.module.css";
import { overviewCta, splitLead } from "./copy";
import { OverviewTitle, RequestCard } from "./parts";
import styles from "./zigzag.module.css";

/**
 * The page's `overview` photo (a slot, never the hero photo) on a tilted accent
 * block, with the page's request floating over the edge nearest the copy. The
 * seed decides which side the photo sits on.
 */
export function OverviewZigzag({ page }: { page: SeoPage }) {
  const flip = pageCoin(page, "overview");
  const [lead, rest] = splitLead(page.intro);
  return (
    <section className={`${shell.section} ${shell.canvas} ${styles.section}`} id="overview" aria-labelledby="overview-title" data-flip={flip ? "true" : undefined}>
      <div className={`${shell.frame} ${styles.layout}`}>
        <Reveal className={styles.media}>
          <span className={`${styles.backdrop} ${shell.accent} ${shell.grid}`} aria-hidden="true" />
          <div className={styles.photo}>
            <SeoImageSlot className={slot.fill} slot={seoImageSlot({ collection: page.collection, slug: page.slug }, "overview")} sizes="(min-width: 900px) 42vw, 100vw" />
          </div>
          <div className={styles.float} aria-hidden="true">
            <RequestCard page={page} handle={exampleHandle(page, 1)} />
          </div>
        </Reveal>
        <div className={styles.copy}>
          <p className={shell.monoPill}>{seoTopics[page.topic]}</p>
          <OverviewTitle className={`${shell.h2} ${styles.title}`} text={topicLine(page, "inboxTitles")} />
          <p className={styles.lead}>{lead}</p>
          {rest ? <p className={styles.body}>{rest}</p> : null}
          <div className={shell.actions}>
            <Link className={shell.primaryAction} href="/signup"><ButtonRoll label={overviewCta} /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
