import Link from "next/link";
import { getSeoPages, seoCollections, seoPagePath, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { LEGAL_ENTITY, legalCopyrightHolder } from "@/src/lib/legal-entity";
import { isMarketingPath, marketingHref } from "@/src/lib/site-routing";
import { LinkarMark } from "../linkar-mark";
import { FooterDirectory, type FooterDirectoryGroup } from "./footer-directory";
import styles from "./marketing-footer.module.css";
import { TrustLockups } from "./trust-lockups";

const columns = [
  {
    title: "Product",
    links: [
      ["All features", "/features"],
      ["Pricing", "/pricing"],
      ["Channels", "/#channels"],
      ["How it works", "/#how-it-works"],
      ["Get started", "/signup"],
    ],
  },
  {
    title: "Resources",
    links: [
      ["Workflow recipes", "/templates"],
      ["Solutions", "/solutions"],
      ["Help and support", "/support"],
      ["Questions", "/#faq"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Company",
    links: [
      ["Linkar home", "/#top"],
      ["Setup", "/#setup"],
      ["Sign in", "/login"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Terms", "/terms"],
      ["Refund policy", "/refund-policy"],
      ["Acceptable use", "/acceptable-use"],
      ["Privacy", "/privacy"],
      ["Cookies", "/cookies"],
      ["Data processing", "/data-processing"],
      ["Service providers", "/service-providers"],
      ["Data deletion", "/data-deletion"],
    ],
  },
] as const;

const directoryOrder = ["features", "solutions", "templates"] as const satisfies readonly SeoCollection[];

/**
 * Footer names that the rules below cannot shorten well. The flow builder's
 * label would keep "Instagram automation" on every page's footer, an anchor
 * that belongs to the homepage.
 */
const footerShortLabels: Readonly<Record<string, string>> = {
  "/features/no-code-instagram-flow-builder": "No code flow builder",
};

/**
 * A short footer name for a guide. The directory groups already say which
 * collection a link belongs to, so the repeated "Instagram automation for" and
 * "template" wording is dropped. Facebook guides keep their channel name.
 */
function footerLabel(page: SeoPage): string {
  const fixed = footerShortLabels[seoPagePath(page)];
  if (fixed) return fixed;
  const short = page.label
    .replace(/^Instagram automation for /, "")
    .replace(/ template$/, "")
    .replace(/^Instagram /, "");
  return short.charAt(0).toUpperCase() + short.slice(1);
}

function directoryGroups(siteOrigin?: string): FooterDirectoryGroup[] {
  return directoryOrder.map((collection) => ({
    title: seoCollections[collection].label,
    path: `/${collection}`,
    href: marketingHref(`/${collection}`, siteOrigin),
    links: getSeoPages(collection).map((page) => {
      const path = seoPagePath(page);
      return { label: footerLabel(page), path, href: marketingHref(path, siteOrigin) };
    }),
  }));
}

/** The legal owner of the site: the proprietor once named, else the trade name. */
function copyrightLine(): string {
  const holder = legalCopyrightHolder();
  return holder === LEGAL_ENTITY.tradeName ? `${holder}.` : `${holder}, trading as ${LEGAL_ENTITY.tradeName}.`;
}

type MarketingFooterProps = {
  /** Drops the tall vertical stage on utility pages while keeping the same
      navigation and legal content. */
  compact?: boolean;
  /**
   * Absolute origin of the marketing host, for pages served from another host.
   * The auth screens run on the app host, where a relative "/#product" resolves
   * to the app root and gets bounced back to the login page.
   */
  siteOrigin?: string;
};

/**
 * The complete, route-safe footer for the public marketing page.
 *
 * There used to be a 22rem "LINKAR" wordmark stamped across the bottom, with a
 * `hideWordmark` prop so every page except the homepage could opt out of it.
 * It is gone, and the footer no longer reserves the ~900px of height it needed.
 */
export function MarketingFooter({ compact = false, siteOrigin }: MarketingFooterProps = {}) {
  const year = new Date().getFullYear();

  return (
    <footer id="resources" className={`${styles.footer} ${compact ? styles.compact : ""}`} data-compact={compact ? "true" : undefined}>
      <div className={styles.frame}>
        <div className={styles.topGrid}>
          <div className={styles.brand}>
            <Link className={styles.brandLink} href={marketingHref("/#top", siteOrigin)} aria-label="Linkar home">
              <LinkarMark size={30} />
              <span>Linkar</span>
            </Link>
            <p>Linkar keeps repeatable conversations moving and makes human attention count.</p>
            <TrustLockups className={styles.trust} />
          </div>

          <nav className={styles.navigation} aria-label="Footer">
            {columns.map((column) => (
              <div className={styles.column} key={column.title}>
                <p className={styles.columnTitle}>{column.title}</p>
                <ul>
                  {column.links.map(([label, href]) => (
                    <li key={label}>
                      {/* App-bound links (/signup, /login) are cross-host from the
                          marketing site, where a next/link prefetch or fetch would
                          follow a 307 to the app origin and trip CSP's
                          connect-src 'self', so they are plain links. */}
                      {isMarketingPath(href) ? (
                        <Link href={marketingHref(href, siteOrigin)}>{label}</Link>
                      ) : (
                        <a href={href}>{label}</a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <FooterDirectory groups={directoryGroups(siteOrigin)} markCurrent={!siteOrigin} />

        <div className={styles.legalLine}>
          <p>© {year} {copyrightLine()}</p>
          <p>Linkar uses Meta’s supported Instagram and Facebook interfaces. Availability and limits depend on the connected account, Page, and platform policies.</p>
        </div>
      </div>
    </footer>
  );
}
