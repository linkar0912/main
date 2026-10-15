import type { MetadataRoute } from "next";
import { LEGAL_ENTITY } from "@/src/lib/legal-entity";
import { HELP_PAGES_UPDATED, MARKETING_PAGES_UPDATED } from "@/src/lib/seo-pages";
import { publicSiteOrigin } from "@/src/lib/site-url";
import { SEO_SITEMAP_COLLECTIONS, seoCollectionSitemap } from "./seo-sitemap-entries";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "10 October 2026" (the wording on the legal pages) as "2026-10-10". */
function isoDateFromLegalDate(value: string): string {
  const match = /^(\d{1,2}) ([A-Z][a-z]+) (\d{4})$/.exec(value.trim());
  const month = match ? MONTHS.indexOf(match[2]) + 1 : 0;
  if (!match || month === 0) throw new Error(`Unreadable legal date: ${value}`);
  return `${match[3]}-${String(month).padStart(2, "0")}-${match[1].padStart(2, "0")}`;
}

/** The effective date the legal pages show, which is when their text last changed. */
const LEGAL_PAGES_UPDATED = isoDateFromLegalDate(LEGAL_ENTITY.effectiveDate);

/**
 * Privacy, cookies and service providers gained the Google Analytics
 * disclosures on 13 October 2026 (commit e57d47b), three days after the
 * effective date the legal pages show.
 */
const ANALYTICS_DISCLOSURES_UPDATED = "2026-10-13";

/**
 * Every public, indexable page on the marketing host. Auth, app, and status
 * pages are left out on purpose; robots.ts disallows them. The catalogue is
 * also split into /features/sitemap.xml and the like, but this sitemap stays
 * complete because it is the one already submitted to search engines.
 *
 * lastModified is the date each page's content last changed, kept in code.
 * Never use the build or request time: a date that moves on every deploy
 * teaches search engines to ignore it.
 */
const PUBLIC_PAGES: Array<{ path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number; lastModified: string }> = [
  { path: "/", changeFrequency: "weekly", priority: 1, lastModified: MARKETING_PAGES_UPDATED },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9, lastModified: MARKETING_PAGES_UPDATED },
  { path: "/support", changeFrequency: "monthly", priority: 0.6, lastModified: HELP_PAGES_UPDATED },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5, lastModified: HELP_PAGES_UPDATED },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3, lastModified: LEGAL_PAGES_UPDATED },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3, lastModified: LEGAL_PAGES_UPDATED },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3, lastModified: ANALYTICS_DISCLOSURES_UPDATED },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.2, lastModified: ANALYTICS_DISCLOSURES_UPDATED },
  { path: "/acceptable-use", changeFrequency: "yearly", priority: 0.2, lastModified: LEGAL_PAGES_UPDATED },
  { path: "/data-processing", changeFrequency: "yearly", priority: 0.2, lastModified: LEGAL_PAGES_UPDATED },
  { path: "/service-providers", changeFrequency: "yearly", priority: 0.2, lastModified: ANALYTICS_DISCLOSURES_UPDATED },
  { path: "/data-deletion", changeFrequency: "yearly", priority: 0.2, lastModified: LEGAL_PAGES_UPDATED },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicSiteOrigin();
  return [...PUBLIC_PAGES.map(({ path, changeFrequency, priority, lastModified }) => ({
    url: path === "/" ? origin : `${origin}${path}`,
    lastModified,
    changeFrequency,
    priority,
  })),
  ...SEO_SITEMAP_COLLECTIONS.flatMap((collection) => seoCollectionSitemap(collection, origin))];
}
