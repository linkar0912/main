import { topicGuides, type SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { Icon } from "../../mock-ui";
import { detailLayout } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import { finalCtaTone, topicVisuals } from "../../seo-theme";
import { notesEyebrow, notesGuideEyebrow, recipeDownload, recipeHref } from "./copy";
import { ScribbleTitle } from "./scribble";
import styles from "./statement.module.css";

type StatementTone = "yellow" | "lilac" | "mint";

/**
 * Yellow by default. When the page already has a yellow block (the channels
 * extra, or the yellow plans CTA on plum and raspberry pages) the notes switch
 * to lilac, or to mint when the lilac example flow is on the page too.
 */
function statementTone(page: SeoPage): StatementTone {
  const layout = detailLayout(page);
  const yellowElsewhere = layout.extras.includes("channels")
    || (layout.cta === "plans" && finalCtaTone(topicVisuals[page.topic].accent) === "yellow");
  if (!yellowElsewhere) return "yellow";
  return layout.example === "flow" ? "mint" : "lilac";
}

/**
 * Colour statement: the tip title as one huge line, the tip beside the call to
 * action, then the topic's planning notes as white check cards. Recipes add the
 * plan download as an ink card under the notes title.
 */
export function NotesStatement({ page }: { page: SeoPage }) {
  const guide = topicGuides[page.topic];
  const [tipTitle, tipBody] = page.tip;
  const download = recipeHref(page);
  const tone = statementTone(page);
  return (
    <section className={`${shell.section} ${shell[tone]} ${shell.grid}`} id="campaign-notes" aria-labelledby="notes-title" data-tone={tone}>
      <div className={shell.frame}>
        <p className={shell.monoPill}>{notesEyebrow}</p>
        <h2 id="notes-title" className={`${shell.h2} ${styles.statement}`}>
          <ScribbleTitle text={tipTitle} markClassName={styles.mark} />
        </h2>
        <div className={styles.lead}>
          <p className={styles.tipBody}>{tipBody}</p>
          <div className={styles.leadAction}>
            <a className={shell.inkAction} href="/signup"><ButtonRoll label="Create your first reply" /></a>
          </div>
        </div>

        <div className={styles.guide}>
          <div className={styles.guideHead}>
            <p className={`${shell.eyebrow} ${styles.guideEyebrow}`}>{notesGuideEyebrow}</p>
            <h3 className={styles.guideTitle}>{guide.title}</h3>
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
          <ul className={styles.cards}>
            {guide.paragraphs.map((paragraph, index) => (
              <li key={paragraph} className={styles.card}>
                <span className={styles.cardTop} aria-hidden="true">
                  <span className={styles.check}><Icon name="check" size={18} /></span>
                  <span className={styles.cardTag}>Note {String(index + 1).padStart(2, "0")}</span>
                </span>
                <p>{paragraph}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
