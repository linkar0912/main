import type { SeoPage } from "@/src/content/seo";
import { topicLine } from "../../seo-theme";

/** The mono eyebrow every example variant shares. */
export const exampleHeader = { eyebrow: "Example conversation" } as const;

/** The example headline: one of the topic's three lines, seeded per page like the overview headline. */
export function exampleTitle(page: SeoPage): string {
  return topicLine(page, "exampleTitles");
}
