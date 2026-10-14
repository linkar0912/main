import Link from "next/link";
import type { SeoPage } from "@/src/content/seo";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import styles from "./columns.module.css";
import { faqHelp, faqItems, faqSub, faqTitle } from "./copy";
import { FaqSticker } from "./sticker";

/**
 * Light two-column FAQ: the title and a sub line stay in view on the left while
 * the numbered accordion cards scroll on the right, with the help links after
 * the questions (as in the dark FAQ), so a stacked phone layout reaches the
 * questions first. Native details, so it works without client JS.
 */
export function FaqColumns({ page }: { page: SeoPage }) {
  return (
    <section className={`${shell.section} ${shell.canvas}`} id="questions" aria-labelledby="questions-title">
      <div className={`${shell.frame} ${styles.layout}`}>
        <header className={styles.head}>
          <FaqSticker className={styles.sticker} />
          <h2 id="questions-title" className={`${shell.h2} ${styles.title}`}>{faqTitle}</h2>
          <p className={shell.sub}>{faqSub}</p>
        </header>
        <div className={styles.list}>
          {faqItems(page).map(([question, answer], index) => (
            <details key={question} className={styles.item} open={index === 0}>
              <summary className={styles.summary}>
                <span className={styles.index} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.question}>{question}</span>
                <span className={styles.toggle} aria-hidden="true" />
              </summary>
              <div className={styles.answer}><p>{answer}</p></div>
            </details>
          ))}
        </div>
        <div className={styles.help}>
          <p className={styles.helpLead}>{faqHelp.lead}</p>
          <ul className={styles.helpLinks}>
            {faqHelp.links.map((link) => (
              <li key={link.href}>
                <Link className={`${shell.textAction} ${styles.helpLink}`} href={link.href}>
                  {link.label}<Icon name="arrow-right" size={18} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
