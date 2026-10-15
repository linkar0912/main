import type { MetadataRoute } from "next";
import { seoCollectionSitemap } from "../seo-sitemap-entries";

/** /solutions/sitemap.xml: the solutions hub and its guides. /sitemap.xml lists them too. */
export default function sitemap(): MetadataRoute.Sitemap {
  return seoCollectionSitemap("solutions");
}
