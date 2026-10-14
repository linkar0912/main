import { describe, expect, it } from "vitest";
import { seoPages, type SeoPage } from "@/src/content/seo";
import { destinationNouns, exampleContext, incomingFor, stepKinds } from "../../seo-example";
import { benefitOutcomes } from "../benefits/outcomes";
import { instructionText, stepVisuals } from "./visuals";

const key = (page: SeoPage) => `${page.collection}/${page.slug}`;

/*
 * How it works labels each step with what its title says. These checks run on
 * every page, so new content cannot slip a position-based label back in.
 */
describe.each(seoPages.map((page) => [key(page), page] as const))("How it works for %s", (_key, page) => {
  const kinds = stepKinds(page);
  const visuals = stepVisuals(page);

  it("only goes live on the last step, after any message", () => {
    const last = kinds.length - 1;
    kinds.forEach((kind, index) => {
      if (kind === "live") expect(index, `${page.steps[index][0]} is live before the last step`).toBe(last);
    });
  });

  it("shows a destination only where the step is about one", () => {
    kinds.forEach((kind, index) => {
      if (kind !== "destination") return;
      const [title, body] = page.steps[index];
      // The title names the page or link, or names nothing else and its copy is about the page.
      expect(destinationNouns.test(title) || /\b(pages?|links?|destinations?|product)\b/i.test(body), title).toBe(true);
      expect(title, "a reply step is a message, not a destination").not.toMatch(/\b(reply|response|answer|acknowledgement)\b/i);
    });
  });

  it("never labels a request or detail step as a destination or trigger", () => {
    page.steps.forEach(([title], index) => {
      if (/^list\b|recurring|repeat request|busiest question|enquiry type/i.test(title)) expect(kinds[index], title).toBe("requests");
      if (/^(define|choose)\b.*\b(necessary details|necessary context|useful fields|deciding question)\b/i.test(title)) expect(kinds[index], title).toBe("details");
    });
  });

  it("colours each step differently and names every chip", () => {
    expect(new Set(visuals.map((visual) => visual.tone)).size).toBe(visuals.length);
    for (const visual of visuals) expect(visual.chip.length).toBeGreaterThan(0);
  });

  it("keeps the instruction step's caption apart from the example caption, and benefits off the caption when it is shown", () => {
    if (kinds.includes("instruction") && incomingFor(page).keyword) expect(instructionText(page)).not.toMatch(/link lands in your DMs|for the details\.|for the link\./);
    const context = exampleContext(page);
    if (context === "post" || context === "page" || kinds.includes("instruction")) expect(benefitOutcomes(page)).not.toContain("caption");
  });
});
