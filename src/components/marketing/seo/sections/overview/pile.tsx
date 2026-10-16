import { seoTopics, type SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { Reveal } from "../../../reveal";
import { MockStatus } from "../../mock-ui";
import { exampleHandle, sentLabel } from "../../seo-example";
import { pageCoin } from "../../seo-layout";
import { topicLine } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import { overviewCta, splitSentences } from "./copy";
import { OverviewTitle, RequestCard, RequestStub } from "./parts";
import styles from "./pile.module.css";

/** Facebook pages get a sky panel; the rest pick yellow or lilac by seed. */
function panelTone(page: SeoPage) {
  if (page.topic === "facebook") return shell.sky;
  return pageCoin(page, "overview-tone") ? shell.lilac : shell.yellow;
}

/**
 * The same request piling up: two older requests (header rows only) under the
 * newest one, which carries the page's real request, and one status pill.
 * Beside it, the topic's overview copy, one sentence per line.
 */
export function OverviewPile({ page }: { page: SeoPage }) {
  const [lead, ...lines] = splitSentences(page.intro);
  return (
    <section className={`${shell.section} ${shell.canvas} ${styles.section}`} id="overview" aria-labelledby="overview-title">
      <div className={`${shell.frame} ${styles.layout}`}>
        <Reveal className={`${styles.stage} ${panelTone(page)} ${shell.grid} ${shell.panel}`} aria-hidden="true">
          <div className={styles.scene}>
            <div className={styles.pile}>
              <RequestStub className={styles.back} handle={exampleHandle(page, 0)} time="5m" />
              <RequestStub className={styles.middle} handle={exampleHandle(page, 2)} time="2m" />
              <RequestCard className={styles.front} page={page} handle={exampleHandle(page, 1)} />
            </div>
            <MockStatus tone="ink" className={styles.status}>{sentLabel(page)}</MockStatus>
          </div>
        </Reveal>
        <div className={styles.copy}>
          <p className={shell.monoPill}>{seoTopics[page.topic]}</p>
          <OverviewTitle className={`${shell.h2} ${styles.title}`} text={topicLine(page, "inboxTitles")} />
          <p className={styles.lead}>{lead}</p>
          {lines.map((line, index) => <p key={index} className={styles.line}>{line}</p>)}
          <div className={shell.actions}>
            <a className={shell.primaryAction} href="/signup"><ButtonRoll label={overviewCta} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
