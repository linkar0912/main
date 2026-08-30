import Link from "next/link";
import { Reveal } from "./reveal";
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
  /** When set, omits the giant "LINKAR" wordmark (it dominates the footer on
      short pages like the auth screens). Defaults to false (homepage). */
  hideWordmark?: boolean;
  /** Keeps the same navigation and legal content while removing the oversized
      homepage wordmark and vertical stage on utility pages. */
  compact?: boolean;
};

/** The complete, route-safe footer for the public marketing page. */
export function MarketingFooter({ hideWordmark = false, compact = false }: MarketingFooterProps = {}) {
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

        {hideWordmark || compact ? null : (
          <Reveal as="p" className={styles.wordmark} aria-hidden="true" data-reduced-motion-state="visible">
            LINKAR
          </Reveal>
        )}
      </div>
    </footer>
  );
}
