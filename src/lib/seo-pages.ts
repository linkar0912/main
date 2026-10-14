import type { Metadata } from "next";
import { getSeoPages, SEO_CONTENT_UPDATED, seoCollections, seoPagePath, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { OPEN_GRAPH_DEFAULTS, publicSiteOrigin } from "./site-url";
import { seoHeroAsset, type SeoHeroPage } from "./seo-hero-assets";

export function seoHeroImage(page: SeoHeroPage): string {
  return seoHeroAsset(page).src;
}

function metadataFor(title: string, description: string, path: string, image: ReturnType<typeof seoHeroAsset>): Metadata {
  const images = [{ url: image.src, width: image.width, height: image.height, alt: image.alt }];
  return {
    title, description, alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, title, description, url: path, images },
    twitter: { card: "summary_large_image", title, description, images: [image.src] },
  };
}

export function seoPageMetadata(page: SeoPage): Metadata {
  return metadataFor(`${page.label} · Linkar`, page.description, seoPagePath(page), seoHeroAsset(page));
}

export function seoCollectionMetadata(collection: SeoCollection): Metadata {
  const hub = seoCollections[collection];
  return metadataFor(hub.title, hub.description, `/${collection}`, seoHeroAsset({ collection }));
}

export function seoStructuredData(page: SeoPage) {
  const origin = publicSiteOrigin();
  const path = seoPagePath(page);
  const url = `${origin}${path}`;
  return [
    {
      "@context": "https://schema.org", "@type": "WebPage", "@id": `${url}#webpage`,
      url, name: page.label, description: page.description, inLanguage: "en-IN",
      dateModified: SEO_CONTENT_UPDATED, isPartOf: { "@id": `${origin}/#website` },
      about: { "@type": "SoftwareApplication", name: "Linkar", url: origin, applicationCategory: "BusinessApplication", operatingSystem: "Web" },
      breadcrumb: { "@id": `${url}#breadcrumb` },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Linkar", item: origin },
        { "@type": "ListItem", position: 2, name: seoCollections[page.collection].label, item: `${origin}/${page.collection}` },
        { "@type": "ListItem", position: 3, name: page.label, item: url },
      ],
    },
  ];
}

export function seoCollectionStructuredData(collection: SeoCollection) {
  const origin = publicSiteOrigin();
  const hub = seoCollections[collection];
  const url = `${origin}/${collection}`;
  return [
    {
      "@context": "https://schema.org", "@type": "CollectionPage", "@id": `${url}#webpage`,
      url, name: hub.title, description: hub.description, inLanguage: "en-IN", dateModified: SEO_CONTENT_UPDATED,
      isPartOf: { "@id": `${origin}/#website` }, breadcrumb: { "@id": `${url}#breadcrumb` },
      mainEntity: {
        "@type": "ItemList", itemListElement: getSeoPages(collection).map((page, index) => ({
          "@type": "ListItem", position: index + 1, name: page.label, url: `${origin}${seoPagePath(page)}`,
        })),
      },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList", "@id": `${url}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Linkar", item: origin },
        { "@type": "ListItem", position: 2, name: hub.label, item: url },
      ],
    },
  ];
}
