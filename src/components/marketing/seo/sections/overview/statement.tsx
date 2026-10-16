import { seoTopics, type SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { MockAvatar } from "../../mock-ui";
import { topicLine } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import { overviewCta, requestChips, splitLead } from "./copy";
import { OverviewTitle } from "./parts";
import styles from "./statement.module.css";

/**
 * The topic's problem as a huge two-part statement on a band, with three
 * requests underneath (the page's own first), and the intro beside it: a
 * larger first sentence, then the rest.
 */
export function OverviewStatement({ page }: { page: SeoPage }) {
  const [lead, rest] = splitLead(page.intro);
  return (
    <section className={`${shell.section} ${shell.band} ${shell.grid} ${styles.section}`} id="overview" aria-labelledby="overview-title">
      <div className={`${shell.frame} ${styles.layout}`}>
        <div className={styles.statement}>
          <p className={shell.monoPill}>{seoTopics[page.topic]}</p>
          <OverviewTitle className={styles.title} restClassName={styles.titleRest} text={topicLine(page, "inboxTitles")} />
        </div>
        <div className={styles.requests} aria-hidden="true">
          <p className={styles.requestsLabel}>Sound familiar?</p>
          <ul className={styles.chips}>
            {requestChips(page).map((chip) => (
              <li key={chip.handle} className={styles.chip} data-event={chip.event ? "true" : undefined}>
                <MockAvatar name={chip.handle} size={32} />
                <span>{chip.event ? <><strong>{chip.handle}</strong> {chip.text}</> : chip.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.copy}>
          <p className={styles.lead}>{lead}</p>
          {rest ? <p className={styles.body}>{rest}</p> : null}
          <div className={shell.actions}>
            <a className={shell.primaryAction} href="/signup"><ButtonRoll label={overviewCta} /></a>
          </div>
        </div>
      </div>
    </section>
  );
}
