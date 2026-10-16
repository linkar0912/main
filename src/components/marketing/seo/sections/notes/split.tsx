import { topicGuides, type SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { Icon, MockToggleRow } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import { notesEyebrow, notesGuideEyebrow, recipeDownload, recipeHref } from "./copy";
import { ScribbleTitle } from "./scribble";
import styles from "./split.module.css";

/**
 * Full-bleed split: the page's pre-launch tip on the topic accent, the topic's
 * planning notes as check rows on the neutral side. Recipes add the plan download.
 */
export function NotesSplit({ page }: { page: SeoPage }) {
  const guide = topicGuides[page.topic];
  const download = recipeHref(page);
  const [tipTitle, tipBody] = page.tip;
  return (
    <section className={styles.notes} id="campaign-notes" aria-labelledby="notes-title" data-topic={page.topic}>
      <div className={`${styles.tip} ${shell.accent} ${shell.grid}`}>
        <div className={styles.tipInner}>
          {/* The label and its sticker read as one tag: the automation stays off until the notes are done. */}
          <div className={styles.tag}>
            <p className={`${shell.monoPill} ${styles.pill}`}>{notesEyebrow}</p>
            <div className={styles.sticker} aria-hidden="true">
              <MockToggleRow label="Not live yet" on={false} />
            </div>
          </div>
          <h2 id="notes-title" className={`${shell.h2} ${styles.title}`}>
            <ScribbleTitle text={tipTitle} markClassName={styles.mark} />
          </h2>
          <p className={styles.tipBody}>{tipBody}</p>
          <div className={shell.actions}>
            <a className={shell.inverseAction} href="/signup"><ButtonRoll label="Create your first reply" /></a>
          </div>
        </div>
      </div>
      <div className={styles.guide}>
        <div className={styles.guideInner}>
          <p className={`${shell.eyebrow} ${styles.guideEyebrow}`}><span className={styles.dot} aria-hidden="true" />{notesGuideEyebrow}</p>
          <h3 className={styles.guideTitle}>{guide.title}</h3>
          <ul className={styles.checks}>
            {guide.paragraphs.map((paragraph) => (
              <li key={paragraph}>
                <span className={styles.check} aria-hidden="true"><Icon name="check" size={18} /></span>
                <p>{paragraph}</p>
              </li>
            ))}
          </ul>
          {download ? (
            <a className={styles.download} href={download} download>
              <span className={styles.downloadIcon} aria-hidden="true"><Icon name="download" size={20} /></span>
              <span className={styles.downloadText}>
                <strong>{recipeDownload.title}</strong>
                <span>{recipeDownload.sub}</span>
              </span>
              <Icon name="arrow-right" size={20} className={styles.downloadArrow} />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
