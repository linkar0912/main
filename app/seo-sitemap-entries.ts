import type { MetadataRoute } from "next";
import { SEO_CONTENT_UPDATED, getSeoPages, seoPagePath, type SeoCollection } from "@/src/content/seo";
import { seoHeroAsset } from "@/src/lib/seo-hero-assets";
import { publicSiteOrigin } from "@/src/lib/site-url";

/**
 * The collections with their own nested sitemap (app/<collection>/sitemap.ts),
 * served at /<collection>/sitemap.xml and listed in robots.txt.
 */
export const SEO_SITEMAP_COLLECTIONS = ["features", "solutions", "templates"] as const satisfies readonly SeoCollection[];

/** Absolute sitemap URLs: the complete root sitemap first, then one per collection. */
export function sitemapUrls(origin = publicSiteOrigin()): string[] {
  return [`${origin}/sitemap.xml`, ...SEO_SITEMAP_COLLECTIONS.map((collection) => `${origin}/${collection}/sitemap.xml`)];
}

/**
 * A collection hub and every guide in it, each with its hero photograph for
 * image search. The /templates/<slug>/recipe downloads are noindex and never
 * listed here.
 */
export function seoCollectionSitemap(collection: SeoCollection, origin = publicSiteOrigin()): MetadataRoute.Sitemap {
  const priority = collection === "features" ? 0.8 : 0.7;
  return [
    {
      url: `${origin}/${collection}`,
      lastModified: SEO_CONTENT_UPDATED,
      changeFrequency: "monthly",
      priority: 0.8,
      images: [`${origin}${seoHeroAsset({ collection }).src}`],
    },
    ...getSeoPages(collection).map((page) => ({
      url: `${origin}${seoPagePath(page)}`,
      lastModified: SEO_CONTENT_UPDATED,
      changeFrequency: "monthly" as const,
      priority,
      images: [`${origin}${seoHeroAsset(page).src}`],
    })),
  ];
}
