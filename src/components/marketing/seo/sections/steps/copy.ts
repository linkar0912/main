import type { SeoPage } from "@/src/content/seo";
import { stepsTitle } from "../../seo-theme";

export type StepsHeader = { recipe: boolean; eyebrow: string; title: string; sub: string; recipeHref: string | null };

/** Header copy for How it works. The headline is seeded per page (see `stepsTitle`); recipes talk about adapting the plan. */
export function stepsHeader(page: SeoPage): StepsHeader {
  const recipe = page.collection === "templates";
  return {
    recipe,
    eyebrow: recipe ? "Recipe in 3 steps" : "3 step process",
    title: stepsTitle(page),
    sub: recipe
      ? "Replace the sample copy and links, then test the supported journey in your own account."
      : "Start with one clear request. Build the answer around the person who sent it.",
    recipeHref: recipe ? `/templates/${page.slug}/recipe` : null,
  };
}
