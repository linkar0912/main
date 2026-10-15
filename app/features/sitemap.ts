import type { MetadataRoute } from "next";
import { seoCollectionSitemap } from "../seo-sitemap-entries";

/** /features/sitemap.xml: the features hub and its guides. /sitemap.xml lists them too. */
export default function sitemap(): MetadataRoute.Sitemap {
  return seoCollectionSitemap("features");
}
