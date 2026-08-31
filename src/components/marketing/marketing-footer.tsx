import Link from "next/link";
import styles from "./marketing-footer.module.css";

const columns = [
  {
    title: "Product",
    links: [
      ["Product", "/#product"],
      ["Channels", "/#channels"],
      ["How it works", "/#how-it-works"],
      ["Workflows", "/#workflows"],
      ["Get started", "/signup"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Help", "/help"],
      ["Support", "/support"],
      ["Login", "/login"],
      ["Dashboard", "/dashboard"],
    ],
  },
  {
    title: "Company",
    links: [
      ["Linkar home", "/#top"],
      ["Setup", "/#setup"],
      ["Questions", "/#faq"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
      ["Data deletion", "/data-deletion"],
    ],
  },
] as const;

type MarketingFooterProps = {
  /** Drops the tall vertical stage on utility pages while keeping the same
      navigation and legal content. */
  compact?: boolean;
};

/**
 * The complete, route-safe footer for the public marketing page.
 *
 * There used to be a 22rem "LINKAR" wordmark stamped across the bottom, with a
 * `hideWordmark` prop so every page except the homepage could opt out of it.
 * It is gone, and the footer no longer reserves the ~900px of height it needed.
 */
export function MarketingFooter({ compact = false }: MarketingFooterProps = {}) {
  const year = new Date().getFullYear();

  return (
    <footer id="resources" className={`${styles.footer} ${compact ? styles.compact : ""}`} data-compact={compact ? "true" : undefined}>
      <div className={styles.frame}>
        <div className={styles.topGrid}>
          <div className={styles.brand}>
            <Link className={styles.brandLink} href="/#top" aria-label="Linkar home">
              <span>Linkar</span>
            </Link>
            <p>Linkar keeps repeatable conversations moving and makes human attention count.</p>
          </div>

          <nav className={styles.navigation} aria-label="Footer">
            {columns.map((column) => (
              <div className={styles.column} key={column.title}>
                <h2>{column.title}</h2>
                <ul>
                  {column.links.map(([label, href]) => (
                    <li key={label}>
                      <Link href={href}>{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.legalLine}>
          <p>© {year} Linkar.</p>
          <p>Linkar uses Meta’s supported Instagram and Facebook interfaces. Availability and limits depend on the connected account, Page, and platform policies.</p>
        </div>
      </div>
    </footer>
  );
}
