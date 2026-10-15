import Link from "next/link";
import { seoTopics, type SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { Reveal } from "../../../reveal";
import { pageCoin } from "../../seo-layout";
import { topicLine } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import { overviewCta, splitLead } from "./copy";
import { OverviewTitle, RequestCard } from "./parts";
import { ZigzagVisual, zigzagSender } from "./zigzag-visual";
import styles from "./zigzag.module.css";

/**
 * Where the page's request arrives (its post, Page post, Story or inbox, drawn
 * in code) as a square on a tilted accent block, with the request itself
 * floating over the edge nearest the copy. The request hangs from a fixed
 * height over the square (--float-reach), so the square's screens know how
 * much of their bottom to keep clear. The seed decides which side the square
 * sits on.
 */
export function OverviewZigzag({ page }: { page: SeoPage }) {
  const flip = pageCoin(page, "overview");
  const [lead, rest] = splitLead(page.intro);
  return (
    <section className={`${shell.section} ${shell.canvas} ${styles.section}`} id="overview" aria-labelledby="overview-title" data-flip={flip ? "true" : undefined}>
      <div className={`${shell.frame} ${styles.layout}`}>
        <Reveal className={styles.media}>
          <div className={styles.square}>
            <span className={`${styles.backdrop} ${shell.accent} ${shell.grid}`} aria-hidden="true" />
            <ZigzagVisual page={page} flip={flip} />
          </div>
          <div className={styles.float} aria-hidden="true">
            <RequestCard page={page} handle={zigzagSender(page)} />
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
