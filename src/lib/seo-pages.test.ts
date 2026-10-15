import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSeoPages, SEO_CONTENT_UPDATED, seoCollections, seoPages, seoTopics, type SeoCollection, type SeoTopic } from "@/src/content/seo";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "./billing/catalog";
import {
  contactStructuredData,
  HELP_PAGES_UPDATED,
  HOME_HERO_IMAGE,
  homeStructuredData,
  jsonLdHtml,
  MARKETING_PAGES_UPDATED,
  ORGANIZATION_DESCRIPTION,
  ORGANIZATION_DISAMBIGUATION,
  pricingStructuredData,
  seoCollectionMetadata,
  seoCollectionStructuredData,
  seoHubPages,
  seoPageMetadata,
  seoStructuredData,
  softwareId,
  supportStructuredData,
} from "./seo-pages";
import { seoHeroAsset } from "./seo-hero-assets";
import { DEFAULT_SOCIAL_IMAGE } from "./social-image";

// The page bodies are not under test here, only their head metadata and JSON-LD.
vi.mock("@/src/components/marketing/marketing-page", () => ({ MarketingPage: () => null }));
vi.mock("@/src/components/marketing/pricing-page", () => ({ PricingPage: () => null }));
vi.mock("@/src/components/public-page", () => ({ PublicPage: () => null }));

const { default: HomePage, generateMetadata: homeMetadata } = await import("@/app/page");
const { default: PricingPage, metadata: pricingMetadata } = await import("@/app/pricing/page");
const { default: ContactPage } = await import("@/app/contact/page");
const { default: SupportPage } = await import("@/app/support/page");

const ORIGIN = "https://linkar.in";
const SOFTWARE_ID = `${ORIGIN}/#software`;
const WEBSITE = { "@type": "WebSite", "@id": `${ORIGIN}/#website`, name: "Linkar", url: ORIGIN };
const ORGANIZATION = { "@type": "Organization", "@id": `${ORIGIN}/#organization`, name: "Linkar", url: ORIGIN };
const SOFTWARE = { "@id": SOFTWARE_ID, name: "Linkar", url: ORIGIN };
const collections: SeoCollection[] = ["features", "solutions", "templates"];

type Node = Record<string, unknown>;

/** Every JSON-LD block a rendered page embeds, parsed. */
function renderedJsonLd(page: () => unknown): unknown[] {
  const html = renderToStaticMarkup(createElement(page as () => null));
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => JSON.parse(match[1]));
}

/** Every structured data array the site emits, by page. */
function allStructuredData(): [string, Node[]][] {
  return [
    ["/", homeStructuredData("Home", "Description")],
    ["/pricing", pricingStructuredData("Pricing", "Description")],
    ["/contact", contactStructuredData("Contact us", "Description")],
    ["/support", supportStructuredData("Support", "Description")],
    ...collections.map((collection): [string, Node[]] => [`/${collection}`, seoCollectionStructuredData(collection)]),
    ...seoPages.map((page): [string, Node[]] => [`/${page.collection}/${page.slug}`, seoStructuredData(page)]),
  ];
}

function otherPages(): [string, Node[]][] {
  return allStructuredData().filter(([path]) => path !== "/");
}

function nodeOfType(data: Node[], type: string): Node {
  const node = data.find((candidate) => candidate["@type"] === type);
  if (!node) throw new Error(`No ${type} node`);
  return node;
}

function monthlySpecification(paise: number) {
  const price = (paise / 100).toFixed(2);
  return { "@type": "UnitPriceSpecification", price, priceCurrency: "INR", billingDuration: "P1M", unitCode: "MON", unitText: "MONTH", valueAddedTaxIncluded: true };
}

beforeEach(() => vi.stubEnv("PUBLIC_SITE_URL", ORIGIN));
afterEach(() => vi.unstubAllEnvs());

describe("structured data", () => {
  it("embeds JSON-LD that parses on the homepage, pricing, contact and support pages", () => {
    const [home] = renderedJsonLd(HomePage) as Node[][];
    expect(home.map((node) => node["@type"])).toEqual(["Organization", "WebSite", "WebPage", "SoftwareApplication", "FAQPage"]);
    const [pricing] = renderedJsonLd(PricingPage) as Node[][];
    expect(pricing.map((node) => node["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
    const contact = renderedJsonLd(ContactPage) as Node[][];
    expect(contact).toHaveLength(1);
    expect(contact[0].map((node) => node["@type"])).toEqual(["ContactPage", "BreadcrumbList"]);
    expect(contact[0][0]).toMatchObject({ "@id": `${ORIGIN}/contact#webpage`, name: "Contact us", url: `${ORIGIN}/contact` });
    const support = renderedJsonLd(SupportPage) as Node[][];
    expect(support).toHaveLength(1);
    expect(support[0].map((node) => node["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
    expect(support[0][0]).toMatchObject({ "@id": `${ORIGIN}/support#webpage`, name: "Support", url: `${ORIGIN}/support` });
  });

  it("serialises every block to JSON that parses back unchanged, with < escaped", () => {
    for (const [path, data] of allStructuredData()) {
      const html = jsonLdHtml(data);
      expect(html, path).not.toContain("<");
      expect(JSON.parse(html), path).toEqual(data);
      for (const node of data) expect(node["@context"], path).toBe("https://schema.org");
    }
    expect(jsonLdHtml({ text: "</script><b>" })).toBe('{"text":"\\u003c/script>\\u003cb>"}');
  });

  it("describes the organisation and says which Linkar it is, without unsupported identity claims", () => {
    const organization = nodeOfType(homeStructuredData("Home", "Description"), "Organization");
    expect(organization.description).toBe(ORGANIZATION_DESCRIPTION);
    expect(ORGANIZATION_DESCRIPTION).toBe("Linkar is Instagram comment and DM automation for creators and businesses in India.");
    expect(organization.disambiguatingDescription).toBe("Instagram and Facebook Page automation software for creators and businesses in India, at linkar.in.");
    expect(ORGANIZATION_DISAMBIGUATION).toBe(organization.disambiguatingDescription);
    expect(organization.address).toEqual({ "@type": "PostalAddress", addressCountry: "IN" });
    for (const key of ["sameAs", "founder", "alternateName"]) expect(organization, key).not.toHaveProperty(key);
  });

  it("declares the software once on the homepage, with GST-inclusive INR offers monthly for every plan and yearly for each paid plan", () => {
    const data = homeStructuredData("Home", "Description");
    const software = nodeOfType(data, "SoftwareApplication");
    expect(softwareId(ORIGIN)).toBe(SOFTWARE_ID);
    expect(software["@id"]).toBe(SOFTWARE_ID);
    expect(software.image).toBe(`${ORIGIN}/opengraph-image`);
    expect(software.featureList).toEqual(getSeoPages("features").map((page) => page.label));
    const monthlyPlans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)];
    const paidPlans = Object.values(BILLING_PLANS);
    const offers = software.offers as Node[];
    expect(offers).toHaveLength(monthlyPlans.length + paidPlans.length);
    monthlyPlans.forEach((plan, index) => {
      const price = (plan.monthlyPaise / 100).toFixed(2);
      expect(offers[index]).toMatchObject({ "@type": "Offer", name: `${plan.name} plan`, price, priceCurrency: "INR", url: `${ORIGIN}/pricing` });
      expect(offers[index].priceSpecification).toEqual(monthlySpecification(plan.monthlyPaise));
    });
    const yearly = offers.slice(monthlyPlans.length);
    paidPlans.forEach((plan, index) => {
      const price = (plan.annualPaise / 100).toFixed(2);
      expect(yearly[index]).toMatchObject({ "@type": "Offer", name: `${plan.name} plan, yearly`, price, priceCurrency: "INR", url: `${ORIGIN}/pricing` });
      expect(yearly[index].priceSpecification).toEqual({
        "@type": "UnitPriceSpecification",
        price,
        priceCurrency: "INR",
        billingDuration: "P1Y",
        unitCode: "ANN",
        unitText: "YEAR",
        valueAddedTaxIncluded: true,
      });
    });
    expect(yearly.some((offer) => offer.price === "0.00")).toBe(false);
    expect(nodeOfType(data, "FAQPage").mainEntity).not.toHaveLength(0);
  });

  it("gives the homepage its own WebPage node with the hero photo as its primary image", () => {
    const page = nodeOfType(homeStructuredData("Instagram Automation for Comments, DMs & Stories", "Description"), "WebPage");
    expect(page).toEqual({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${ORIGIN}/#webpage`,
      url: ORIGIN,
      name: "Instagram Automation for Comments, DMs & Stories",
      description: "Description",
      inLanguage: "en-IN",
      dateModified: MARKETING_PAGES_UPDATED,
      isPartOf: { "@id": `${ORIGIN}/#website` },
      publisher: { "@id": `${ORIGIN}/#organization` },
      about: { "@id": SOFTWARE_ID },
      primaryImageOfPage: {
        "@type": "ImageObject",
        url: `${ORIGIN}${HOME_HERO_IMAGE.src}`,
        contentUrl: `${ORIGIN}${HOME_HERO_IMAGE.src}`,
        width: 1536,
        height: 1024,
        caption: HOME_HERO_IMAGE.alt,
      },
    });
    // The photo the hero actually renders, with the same description.
    const hero = readFileSync("src/components/marketing/hero-section.tsx", "utf8");
    expect(hero).toContain(`"${HOME_HERO_IMAGE.src}"`);
    expect(hero).toContain(`"${HOME_HERO_IMAGE.alt}"`);
    expect(existsSync(`public${HOME_HERO_IMAGE.src}`)).toBe(true);
  });

  it("names the site and publisher in full on every other page, and keeps the software reference untyped", () => {
    for (const [path, data] of otherPages()) {
      expect(data[0].isPartOf, path).toEqual(WEBSITE);
      expect(data[0].publisher, path).toEqual(ORGANIZATION);
      expect(JSON.stringify(data), path).not.toContain('"@type":"SoftwareApplication"');
    }
    for (const [path, data] of otherPages().filter(([path]) => path !== "/contact")) {
      expect(data[0].about, path).toEqual(SOFTWARE);
    }
    expect(contactStructuredData("Contact us", "Description")[0].about).toEqual(ORGANIZATION);
  });

  it("keeps the page node first and its breadcrumb second", () => {
    for (const [path, data] of otherPages()) {
      expect(data, path).toHaveLength(2);
      expect(data[0]["@id"], path).toBe(`${ORIGIN}${path}#webpage`);
      expect(data[0].url, path).toBe(`${ORIGIN}${path}`);
      expect(data[0].breadcrumb, path).toEqual({ "@id": `${ORIGIN}${path}#breadcrumb` });
      expect(data[1], path).toMatchObject({ "@type": "BreadcrumbList", "@id": `${ORIGIN}${path}#breadcrumb` });
    }
    for (const [path, name, data] of [
      ["/pricing", "Pricing", pricingStructuredData("Pricing", "Description")],
      ["/contact", "Contact", contactStructuredData("Contact us", "Description")],
      ["/support", "Support", supportStructuredData("Support", "Description")],
    ] as const) {
      expect(data[1].itemListElement, path).toEqual([
        { "@type": "ListItem", position: 1, name: "Linkar", item: ORIGIN },
        { "@type": "ListItem", position: 2, name, item: `${ORIGIN}${path}` },
      ]);
    }
    expect(contactStructuredData("Contact us", "Description")[0]["@type"]).toBe("ContactPage");
  });

  it("dates each page node from a fixed constant, never the build time", () => {
    expect(MARKETING_PAGES_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(HELP_PAGES_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(pricingStructuredData("Pricing", "Description")[0].dateModified).toBe(MARKETING_PAGES_UPDATED);
    expect(contactStructuredData("Contact us", "Description")[0].dateModified).toBe(HELP_PAGES_UPDATED);
    expect(supportStructuredData("Support", "Description")[0].dateModified).toBe(HELP_PAGES_UPDATED);
    for (const collection of collections) expect(seoCollectionStructuredData(collection)[0].dateModified).toBe(SEO_CONTENT_UPDATED);
    for (const page of seoPages) expect(seoStructuredData(page)[0].dateModified).toBe(SEO_CONTENT_UPDATED);
  });

  it("names each catalogue page's hero photo as its primary image", () => {
    const targets = [...seoPages.map((page) => ({ page, data: seoStructuredData(page) })), ...collections.map((collection) => ({ page: { collection }, data: seoCollectionStructuredData(collection) }))];
    for (const { page, data } of targets) {
      const asset = seoHeroAsset(page);
      expect(data[0].primaryImageOfPage).toEqual({
        "@type": "ImageObject",
        url: `${ORIGIN}${asset.src}`,
        contentUrl: `${ORIGIN}${asset.src}`,
        width: asset.width,
        height: asset.height,
        caption: asset.alt,
      });
    }
  });

  it("names each hub after its title without the brand, and counts its ItemList", () => {
    for (const collection of collections) {
      const page = seoCollectionStructuredData(collection)[0];
      const title = seoCollections[collection].title;
      expect(title.endsWith(" · Linkar"), collection).toBe(true);
      expect(page.name, collection).toBe(title.slice(0, -" · Linkar".length));
      expect(page.mainEntity?.numberOfItems, collection).toBe(getSeoPages(collection).length);
      expect(page.mainEntity?.itemListElement, collection).toHaveLength(getSeoPages(collection).length);
    }
  });

  it("orders each hub's ItemList the way the hub renders it: by topic, then catalogue order", () => {
    for (const collection of collections) {
      const pages = getSeoPages(collection);
      const rendered = (Object.keys(seoTopics) as SeoTopic[]).flatMap((topic) => pages.filter((page) => page.topic === topic));
      expect(seoHubPages(collection)).toEqual(rendered);
      const list = (seoCollectionStructuredData(collection)[0].mainEntity as { itemListElement: Node[] }).itemListElement;
      expect(list.map((item) => item.url)).toEqual(rendered.map((page) => `${ORIGIN}/${collection}/${page.slug}`));
      expect(list.map((item) => item.position)).toEqual(rendered.map((_, index) => index + 1));
    }
  });

  it("adds no HowTo, rating, review or sameAs nodes anywhere, and FAQPage only on the homepage", () => {
    for (const [path, data] of allStructuredData()) {
      expect(JSON.stringify(data), path).not.toMatch(/"aggregateRating"|"review"|"sameAs"|"@type":"(?:HowTo|Review|AggregateRating)"/);
      if (path !== "/") expect(JSON.stringify(data), path).not.toContain('"@type":"FAQPage"');
    }
  });
});

describe("head metadata", () => {
  const freeQuota = `${FREE_BILLING_PLAN.monthlyDeliveryLimit.toLocaleString("en-IN")} messages a month`;

  it("leads the homepage with the head term and the Free plan quota at search-result lengths", () => {
    const metadata = homeMetadata();
    const lowestPaid = Math.min(...Object.values(BILLING_PLANS).map((plan) => plan.monthlyPaise)) / 100;
    expect(metadata.title).toBe("Instagram Automation for Comments, DMs & Stories · Linkar");
    expect(String(metadata.title)).toHaveLength(57);
    const description = String(metadata.description);
    expect(description).toBe(`Instagram automation for Indian creators and brands: auto-reply to comments, DMs, Stories and Facebook Pages. Free plan: ${freeQuota}, paid from ₹${lowestPaid}.`);
    expect(description.length).toBeGreaterThanOrEqual(150);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).not.toMatch(/\u2014|UPI/);
    const data = homeStructuredData(String(metadata.title).replace(" · Linkar", ""), description);
    expect(nodeOfType(data, "SoftwareApplication").description).toBe(description);
    expect(nodeOfType(data, "WebPage").description).toBe(description);
  });

  it("gives the pricing page its keyword title, the Free plan quota, GST wording and the shared social card", () => {
    expect(pricingMetadata.title).toBe("Instagram automation pricing in India · Linkar");
    const description = String(pricingMetadata.description);
    expect(description).toContain(`Free (${freeQuota})`);
    expect(description).toContain("Prices include applicable GST.");
    for (const plan of Object.values(BILLING_PLANS)) expect(description).toContain(`${plan.name} ₹${plan.monthlyPaise / 100}`);
    expect(description.length).toBeGreaterThanOrEqual(150);
    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).not.toMatch(/\u2014|UPI/);
    expect(pricingMetadata.openGraph?.images).toEqual([DEFAULT_SOCIAL_IMAGE]);
    expect(pricingMetadata.twitter?.images).toEqual([DEFAULT_SOCIAL_IMAGE]);
    expect(DEFAULT_SOCIAL_IMAGE).toMatchObject({ url: "/opengraph-image", width: 1200, height: 630, type: "image/png" });
    expect(DEFAULT_SOCIAL_IMAGE.alt).toBeTruthy();
  });

  it("gives every catalogue page WebP social images with alt text on both cards", () => {
    const targets = [...seoPages.map((page) => ({ page, metadata: seoPageMetadata(page) })), ...collections.map((collection) => ({ page: { collection }, metadata: seoCollectionMetadata(collection) }))];
    for (const { page, metadata } of targets) {
      const asset = seoHeroAsset(page);
      expect(asset.alt.trim()).not.toBe("");
      expect(metadata.openGraph?.images).toEqual([{ url: asset.src, width: asset.width, height: asset.height, alt: asset.alt, type: "image/webp" }]);
      expect(metadata.twitter?.images).toEqual([{ url: asset.src, alt: asset.alt }]);
    }
  });

  it("declares the region in the document language", () => {
    for (const file of ["app/layout.tsx", "app/global-error.tsx"]) {
      expect(readFileSync(file, "utf8"), file).toMatch(/lang="en-IN"/);
    }
  });
});

describe("shared social card", () => {
  it("is a 1200x630 PNG drawn in code with the real Linkar mark", async () => {
    const card = await import("@/app/opengraph-image");
    expect(card.size).toEqual({ width: 1200, height: 630 });
    expect(card.contentType).toBe("image/png");
    expect(card.alt).toBe(DEFAULT_SOCIAL_IMAGE.alt);
    const source = readFileSync("app/opengraph-image.tsx", "utf8");
    const markPath = readFileSync("app/icon.svg", "utf8").match(/ d="([^"]+)"/)?.[1];
    expect(markPath).toBeTruthy();
    expect(source).toContain(JSON.stringify(markPath));
    expect(source).toContain("SOCIAL_CARD_HEADLINE");
    expect(DEFAULT_SOCIAL_IMAGE.alt).toContain("Instagram automation for comments, DMs and Stories");
    expect(source).not.toMatch(/<img|\.(?:png|jpe?g|webp)["']/);
  });
});
