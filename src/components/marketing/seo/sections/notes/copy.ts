import type { SeoPage } from "@/src/content/seo";

export const notesEyebrow = "Before you switch it on";
export const notesGuideEyebrow = "Campaign notes";
export const recipeDownload = {
  title: "Download the recipe plan",
  sub: "A Markdown copy of this recipe to keep with your campaign notes.",
} as const;

/** Recipes carry a Markdown copy of their plan; other pages have none. */
export function recipeHref(page: SeoPage): string | null {
  return page.collection === "templates" ? `/templates/${page.slug}/recipe` : null;
}
