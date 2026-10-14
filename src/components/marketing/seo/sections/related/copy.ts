import { seoCollections, type SeoCollection, type SeoPage } from "@/src/content/seo";

export const relatedTitle = "Keep exploring.";

function relatedNoun(pages: readonly SeoPage[]): string {
  const recipes = pages.filter((page) => page.collection === "templates").length;
  if (recipes === 0) return "guides";
  if (recipes === pages.length) return "recipes";
  return "guides and recipes";
}

export function relatedEyebrow(pages: readonly SeoPage[]): string {
  const noun = relatedNoun(pages);
  return `Related ${noun}`;
}

const countWords = ["No", "One", "Two", "Three", "Four", "Five", "Six"] as const;

/** "Three guides and recipes picked to go with Instagram DM automation." */
export function relatedSub(page: SeoPage, pages: readonly SeoPage[]): string {
  const count = countWords[pages.length] ?? String(pages.length);
  const noun = pages.length === 1 ? relatedNoun(pages).replace(/s\b/g, "") : relatedNoun(pages);
  return `${count} ${noun} picked to go with ${page.label}.`;
}

export function browseAllLabel(collection: SeoCollection): string {
  return `Browse all ${seoCollections[collection].label.toLowerCase()}`;
}

export const collectionNames: Record<SeoCollection, string> = {
  features: "Feature",
  solutions: "Solution",
  templates: "Workflow recipe",
};
