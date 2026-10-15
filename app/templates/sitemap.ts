import type { MetadataRoute } from "next";
import { seoCollectionSitemap } from "../seo-sitemap-entries";

/** /templates/sitemap.xml: the workflow recipes hub and its recipes. /sitemap.xml lists them too. */
export default function sitemap(): MetadataRoute.Sitemap {
  return seoCollectionSitemap("templates");
}
