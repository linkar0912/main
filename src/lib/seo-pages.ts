import type { Metadata } from "next";
import { faqItems } from "@/src/components/marketing/marketing-content";
import { getSeoPages, SEO_CONTENT_UPDATED, SEO_HERO_IMAGE, seoCollections, seoPagePath, seoTopics, type SeoCollection, type SeoPage, type SeoTopic } from "@/src/content/seo";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "./billing/catalog";
import { PRODUCT_NAME } from "./branding";
import { LEGAL_ENTITY } from "./legal-entity";
import { MARKETING_HOST } from "./site-routing";
import { OPEN_GRAPH_DEFAULTS, publicSiteOrigin } from "./site-url";
import { seoHeroAsset, type SeoHeroPage } from "./seo-hero-assets";

type ImageAsset = { readonly src: string; readonly alt: string; readonly width: number; readonly height: number };

/**
 * When the homepage and /pricing copy last changed, as an ISO date. It feeds
 * their sitemap lastmod and their WebPage dateModified. Move it forward in the
 * same change as the copy; never derive it from the build or request time.
 */
export const MARKETING_PAGES_UPDATED = "2026-10-15";

/** When /contact and /support last changed: their structured data was added on this date. */
export const HELP_PAGES_UPDATED = "2026-10-15";

/**
 * The one sentence Linkar uses to describe itself everywhere: here, in
 * llms.txt and on every profile (docs/seo/strategy-2026-10.md, section 3.7).
 */
export const ORGANIZATION_DESCRIPTION = `${PRODUCT_NAME} is Instagram comment and DM automation for creators and businesses in India.`;

/**
 * Search results mix Linkar up with other products called Linkar or Linkr,
 * so the Organization says which one this is. No sameAs, founder or
 * alternateName until real profiles and legal facts exist.
 */
export const ORGANIZATION_DISAMBIGUATION = `Instagram and Facebook Page automation software for creators and businesses in India, at ${MARKETING_HOST}.`;

/** The homepage hero photograph, as hero-section.tsx renders it; the homepage's primary image. */
export const HOME_HERO_IMAGE = {
  src: SEO_HERO_IMAGE,
  alt: "A creator relaxing at his desk while Linkar answers his Instagram comments and DMs",
  width: 1536,
  height: 1024,
} as const;

export function seoHeroImage(page: SeoHeroPage): string {
  return seoHeroAsset(page).src;
}

/**
 * JSON for a `<script type="application/ld+json">`. JSON.stringify does not
 * escape "<", so a value containing "</script>" could close the tag early.
 */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** The one SoftwareApplication node. The homepage declares it in full; every other page points at it. */
export function softwareId(origin: string): string {
  return `${origin}/#software`;
}

function websiteId(origin: string): string {
  return `${origin}/#website`;
}

function organizationId(origin: string): string {
  return `${origin}/#organization`;
}

/**
 * Kept untyped on purpose: a typed SoftwareApplication here would be judged
 * as a Software App item on every page, without the offers it has on the homepage.
 */
function softwareRef(origin: string) {
  return { "@id": softwareId(origin), name: PRODUCT_NAME, url: origin };
}

/**
 * Search engines read each URL on its own, and the WebSite and Organization
 * nodes are declared only on the homepage, so pages elsewhere name them in full.
 */
function websiteRef(origin: string) {
  return { "@type": "WebSite", "@id": websiteId(origin), name: PRODUCT_NAME, url: origin };
}

function organizationRef(origin: string) {
  return { "@type": "Organization", "@id": organizationId(origin), name: LEGAL_ENTITY.tradeName, url: origin };
}

function primaryImage(origin: string, image: ImageAsset) {
  const url = `${origin}${image.src}`;
  return { "@type": "ImageObject", url, contentUrl: url, width: image.width, height: image.height, caption: image.alt };
}

/** BreadcrumbList items, starting at the homepage. */
function breadcrumbItems(origin: string, trail: ReadonlyArray<readonly [name: string, url: string]>) {
  return [[PRODUCT_NAME, origin] as const, ...trail].map(([name, item], index) => ({ "@type": "ListItem", position: index + 1, name, item }));
}

/** "Instagram & Facebook Automation Features · Linkar" becomes "Instagram & Facebook Automation Features". */
function withoutBrand(title: string): string {
  const suffix = ` · ${PRODUCT_NAME}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

function metadataFor(title: string, description: string, path: string, image: ImageAsset): Metadata {
  const images = [{ url: image.src, width: image.width, height: image.height, alt: image.alt, type: "image/webp" }];
  return {
    title, description, alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, title, description, url: path, images },
    twitter: { card: "summary_large_image", title, description, images: [{ url: image.src, alt: image.alt }] },
  };
}

export function seoPageMetadata(page: SeoPage): Metadata {
  return metadataFor(`${page.label} · Linkar`, page.description, seoPagePath(page), seoHeroAsset(page));
}

export function seoCollectionMetadata(collection: SeoCollection): Metadata {
  const hub = seoCollections[collection];
  return metadataFor(hub.title, hub.description, `/${collection}`, seoHeroAsset({ collection }));
}

/**
 * A hub's guides in the order the hub shows them: grouped by topic in
 * seoTopics order, then catalogue order within a topic, as SeoHubGroups renders.
 */
export function seoHubPages(collection: SeoCollection): readonly SeoPage[] {
  const pages = getSeoPages(collection);
  return (Object.keys(seoTopics) as SeoTopic[]).flatMap((topic) => pages.filter((page) => page.topic === topic));
}

export function seoStructuredData(page: SeoPage) {
  const origin = publicSiteOrigin();
  const path = seoPagePath(page);
  const url = `${origin}${path}`;
  return [
    {
      "@context": "https://schema.org", "@type": "WebPage", "@id": `${url}#webpage`,
      url, name: page.label, description: page.description, inLanguage: "en-IN",
      dateModified: SEO_CONTENT_UPDATED, isPartOf: websiteRef(origin), publisher: organizationRef(origin),
      about: softwareRef(origin), primaryImageOfPage: primaryImage(origin, seoHeroAsset(page)),
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
      itemListElement: breadcrumbItems(origin, [
        [seoCollections[page.collection].label, `${origin}/${page.collection}`],
        [page.label, url],
      ]),
    },
  ];
}

export function seoCollectionStructuredData(collection: SeoCollection) {
  const origin = publicSiteOrigin();
  const hub = seoCollections[collection];
  const url = `${origin}/${collection}`;
  const pages = seoHubPages(collection);
  return [
    {
      "@context": "https://schema.org", "@type": "CollectionPage", "@id": `${url}#webpage`,
      url, name: withoutBrand(hub.title), description: hub.description, inLanguage: "en-IN", dateModified: SEO_CONTENT_UPDATED,
      isPartOf: websiteRef(origin), publisher: organizationRef(origin), about: softwareRef(origin),
      primaryImageOfPage: primaryImage(origin, seoHeroAsset({ collection })), breadcrumb: { "@id": `${url}#breadcrumb` },
      mainEntity: {
        "@type": "ItemList", numberOfItems: pages.length, itemListElement: pages.map((page, index) => ({
          "@type": "ListItem", position: index + 1, name: page.label, url: `${origin}${seoPagePath(page)}`,
        })),
      },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
      itemListElement: breadcrumbItems(origin, [[hub.label, url]]),
    },
  ];
}

/** One INR offer at a GST-inclusive price, billed monthly or yearly. */
function planOffer(origin: string, name: string, paise: number, interval: "month" | "year") {
  const price = (paise / 100).toFixed(2);
  const period = interval === "month"
    ? { billingDuration: "P1M", unitCode: "MON", unitText: "MONTH" }
    : { billingDuration: "P1Y", unitCode: "ANN", unitText: "YEAR" };
  return {
    "@type": "Offer",
    name,
    price,
    priceCurrency: "INR",
    url: `${origin}/pricing`,
    priceSpecification: { "@type": "UnitPriceSpecification", price, priceCurrency: "INR", ...period, valueAddedTaxIncluded: true },
  };
}

/**
 * Homepage structured data: Organization, WebSite, the homepage WebPage, the
 * SoftwareApplication every other page points at, and FAQPage. Offers are
 * priced from the billing catalog: every plan monthly, and each paid plan
 * yearly; displayed prices include GST. No sameAs, rating or HowTo: add sameAs
 * only for real official profiles, and a rating only for genuine reviews.
 */
export function homeStructuredData(name: string, description: string) {
  const origin = publicSiteOrigin();
  const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)];
  return [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": organizationId(origin),
      name: LEGAL_ENTITY.tradeName,
      url: origin,
      logo: `${origin}/icon.png`,
      description: ORGANIZATION_DESCRIPTION,
      disambiguatingDescription: ORGANIZATION_DISAMBIGUATION,
      email: LEGAL_ENTITY.supportEmail,
      address: { "@type": "PostalAddress", addressCountry: "IN" },
      contactPoint: {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: LEGAL_ENTITY.supportEmail,
        areaServed: "IN",
        availableLanguage: "English",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "@id": websiteId(origin),
      name: PRODUCT_NAME,
      url: origin,
      inLanguage: "en-IN",
      publisher: { "@id": organizationId(origin) },
    },
    {
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${origin}/#webpage`,
      url: origin,
      name,
      description,
      inLanguage: "en-IN",
      dateModified: MARKETING_PAGES_UPDATED,
      isPartOf: { "@id": websiteId(origin) },
      publisher: { "@id": organizationId(origin) },
      about: { "@id": softwareId(origin) },
      primaryImageOfPage: primaryImage(origin, HOME_HERO_IMAGE),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "@id": softwareId(origin),
      name: PRODUCT_NAME,
      url: origin,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description,
      image: `${origin}/opengraph-image`,
      featureList: getSeoPages("features").map((page) => page.label),
      publisher: { "@id": organizationId(origin) },
      offers: [
        ...plans.map((plan) => planOffer(origin, `${plan.name} plan`, plan.monthlyPaise, "month")),
        ...Object.values(BILLING_PLANS).map((plan) => planOffer(origin, `${plan.name} plan, yearly`, plan.annualPaise, "year")),
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];
}

/** A public page one level below the homepage: its page node, then its breadcrumb. */
function topLevelPageStructuredData(page: {
  type: "WebPage" | "ContactPage"; path: string; crumb: string; name: string; description: string; dateModified: string; aboutOrganization?: boolean;
}) {
  const origin = publicSiteOrigin();
  const url = `${origin}${page.path}`;
  return [
    {
      "@context": "https://schema.org", "@type": page.type, "@id": `${url}#webpage`,
      url, name: page.name, description: page.description, inLanguage: "en-IN", dateModified: page.dateModified,
      isPartOf: websiteRef(origin), publisher: organizationRef(origin),
      about: page.aboutOrganization ? organizationRef(origin) : softwareRef(origin),
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
      itemListElement: breadcrumbItems(origin, [[page.crumb, url]]),
    },
  ];
}

/** Pricing page structured data: a WebPage about the software, and its breadcrumb. */
export function pricingStructuredData(name: string, description: string) {
  return topLevelPageStructuredData({ type: "WebPage", path: "/pricing", crumb: "Pricing", name, description, dateModified: MARKETING_PAGES_UPDATED });
}

/** Contact page structured data: a ContactPage about the business, and its breadcrumb. */
export function contactStructuredData(name: string, description: string) {
  return topLevelPageStructuredData({ type: "ContactPage", path: "/contact", crumb: "Contact", name, description, dateModified: HELP_PAGES_UPDATED, aboutOrganization: true });
}

/** Support page structured data: a WebPage about the software, and its breadcrumb. */
export function supportStructuredData(name: string, description: string) {
  return topLevelPageStructuredData({ type: "WebPage", path: "/support", crumb: "Support", name, description, dateModified: HELP_PAGES_UPDATED });
}
