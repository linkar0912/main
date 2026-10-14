import Link from "next/link";
import type { SeoPage } from "@/src/content/seo";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import { faqHelp, faqItems, faqTitle } from "./copy";
import styles from "./dark.module.css";
import { FaqSticker } from "./sticker";

/** Dark, centred accordion on native details: keyboard and find-in-page work without client JS. */
export function FaqDark({ page }: { page: SeoPage }) {
  return (
    <section className={`${shell.section} ${shell.ink} ${styles.faq}`} id="questions" aria-labelledby="questions-title">
      <div className={shell.frame}>
        <header className={`${shell.head} ${styles.head}`}>
          <FaqSticker className={styles.sticker} />
          <h2 id="questions-title" className={shell.h2}>{faqTitle}</h2>
        </header>
        <div className={styles.list}>
          {faqItems(page).map(([question, answer], index) => (
            <details key={question} className={styles.item} open={index === 0}>
              <summary className={styles.summary}>
                <span className={styles.question}>{question}</span>
                <span className={styles.toggle} aria-hidden="true"><Icon name="chevron" size={18} /></span>
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
