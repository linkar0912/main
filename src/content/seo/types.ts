export type SeoCollection = "features" | "solutions" | "templates";
export type SeoTopic = "comments" | "messages" | "stories" | "leads" | "followers" | "team" | "insights" | "facebook";
export type ContentBlock = readonly [title: string, body: string];

/** Editorial content, kept separate from the shared presentation and routing. */
export type SeoPage = {
  collection: SeoCollection;
  slug: string;
  label: string;
  headline: string;
  description: string;
  topic: SeoTopic;
  intro: string;
  benefits: readonly ContentBlock[];
  steps: readonly ContentBlock[];
  example: { incoming: string; reply: string; next: string; note: string };
  tip: ContentBlock;
  faq: ContentBlock;
  related: readonly string[];
};

export type SeoPageInput = Omit<SeoPage, "collection">;

/** The date the catalogue copy last changed: the sitemap lastmod and every page's dateModified. */
export const SEO_CONTENT_UPDATED = "2026-10-15";
export const SEO_HERO_IMAGE = "/marketing/linkar-hero-indian-relaxed.webp";

export function seoPagePath(page: Pick<SeoPage, "collection" | "slug">): string {
  return `/${page.collection}/${page.slug}`;
}
