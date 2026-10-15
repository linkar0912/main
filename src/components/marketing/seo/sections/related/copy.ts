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

/** A label mid-sentence: "no code Instagram automation builder", but "Instagram DM automation" keeps its capital. */
function labelInSentence(label: string): string {
  return /^(Instagram|Facebook|Linkar)\b/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * The intro under the related title, written for what the reader is doing on
 * each collection: setting up a feature, applying a solution, or adapting a
 * recipe. "Three guides and recipes to read next when you set up Instagram
 * DM automation."
 */
export function relatedSub(page: SeoPage, pages: readonly SeoPage[]): string {
  const count = countWords[pages.length] ?? String(pages.length);
  const noun = pages.length === 1 ? relatedNoun(pages).replace(/s\b/g, "") : relatedNoun(pages);
  const label = labelInSentence(page.label);
  if (page.collection === "solutions") return `${count} ${noun} that ${pages.length === 1 ? "helps" : "help"} you put ${label} into practice.`;
  if (page.collection === "templates") return `${count} ${noun} to read before you adapt the ${label}.`;
  return `${count} ${noun} to read next when you set up ${label}.`;
}

export function browseAllLabel(collection: SeoCollection): string {
  return `Browse all ${seoCollections[collection].label.toLowerCase()}`;
}

export const collectionNames: Record<SeoCollection, string> = {
  features: "Feature",
  solutions: "Solution",
  templates: "Workflow recipe",
};
