import Link from "next/link";
import { LinkarMark } from "@/src/components/linkar-mark";
import { Reveal } from "./reveal";
import styles from "./marketing-footer.module.css";

const columns = [
  {
    title: "Product",
    links: [
      ["Product", "/#product"],
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

/** The complete, route-safe footer for the public marketing page. */
export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer id="resources" className={styles.footer}>
      <div className={styles.frame}>
        <div className={styles.topGrid}>
          <div className={styles.brand}>
            <Link className={styles.brandLink} href="/#top" aria-label="Linkar home">
              <LinkarMark size={26} />
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
                      <Link href={href} aria-label={label === "Linkar home" ? "Linkar home section" : undefined}>{label}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className={styles.legalLine}>
          <p>© {year} Linkar.</p>
          <p>Linkar uses supported platform interfaces. Availability and messaging limits depend on the connected account and platform policies.</p>
        </div>

        <Reveal as="p" className={styles.wordmark} aria-hidden="true" data-reduced-motion-state="visible">
          LINKAR
        </Reveal>
      </div>
    </footer>
  );
}
