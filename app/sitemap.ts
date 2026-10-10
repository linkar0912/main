import type { MetadataRoute } from "next";
import { publicSiteOrigin } from "@/src/lib/site-url";

/**
 * Every public, indexable page on the marketing host. Auth, app, and status
 * pages are left out on purpose; robots.ts disallows them.
 */
const PUBLIC_PAGES: Array<{ path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/support", changeFrequency: "monthly", priority: 0.6 },
  { path: "/contact", changeFrequency: "yearly", priority: 0.5 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.3 },
  { path: "/refund-policy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.3 },
  { path: "/cookies", changeFrequency: "yearly", priority: 0.2 },
  { path: "/acceptable-use", changeFrequency: "yearly", priority: 0.2 },
  { path: "/data-processing", changeFrequency: "yearly", priority: 0.2 },
  { path: "/service-providers", changeFrequency: "yearly", priority: 0.2 },
  { path: "/data-deletion", changeFrequency: "yearly", priority: 0.2 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = publicSiteOrigin();
  return PUBLIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: path === "/" ? origin : `${origin}${path}`,
    changeFrequency,
    priority,
  }));
}
