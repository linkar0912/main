import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const marketingPage = readFileSync(new URL("./marketing-page.module.css", import.meta.url), "utf8");
const structuralStyles = [
  "automation-story.module.css",
  "before-after-section.module.css",
  "channel-showcase.module.css",
  "insights-showcase.module.css",
  "manifesto-section.module.css",
  "setup-steps.module.css",
  "surface-runway.module.css",
  "workflow-gallery.module.css",
].map((file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n");

const marketingModules = readdirSync(new URL(".", import.meta.url))
  .filter((file) => file.endsWith(".module.css"))
  .map((file) => [file, readFileSync(new URL(`./${file}`, import.meta.url), "utf8")] as const);

/** Innermost rule blocks as [selector, body]. */
function rules(css: string): Array<[string, string]> {
  return Array.from(css.matchAll(/([^{}]*)\{([^{}]*)\}/g), (match) => [match[1].trim(), match[2]]);
}

describe("marketing labels speak in sentence case", () => {
  // Owner feedback (round 9): the site's nav, eyebrows, tags and button labels
  // were uppercase monospace. They are sentence-case Manrope now, like the app.
  it("never uppercases a label", () => {
    for (const [file, css] of marketingModules) {
      expect(css, file).not.toMatch(/text-transform:\s*uppercase/);
    }
  });

  it("keeps monospace for code-like values only", () => {
    for (const [file, css] of marketingModules) {
      for (const [selector, body] of rules(css)) {
        if (!body.includes("--font-mono")) continue;
        expect(`${file} ${selector}`).toMatch(/\.linkSlug$/);
      }
    }
  });

  it("sets the header nav and account links in the sans face at 13px or more", () => {
    const header = readFileSync(new URL("./marketing-header.module.css", import.meta.url), "utf8");
    const navRule = rules(header).find(([selector, body]) => selector.includes(".accountNavigation a") && body.includes("font-size"));

    expect(navRule?.[1]).toMatch(/font-family:\s*var\(--font-sans/);
    const size = Number(navRule?.[1].match(/font-size:\s*([\d.]+)rem/)?.[1]);
    expect(size * 16).toBeGreaterThanOrEqual(13);
  });
});

describe("marketing typography hierarchy", () => {
  it("shares one scale across section introductions and content cards", () => {
    expect(marketingPage).toContain("--marketing-lede-size:");
    expect(marketingPage).toContain("--marketing-card-title-size:");
    expect(marketingPage).toContain("--marketing-body-size:");
    expect(marketingPage).toContain("--marketing-label-size:");

    expect(structuralStyles.match(/font-size:\s*var\(--marketing-lede-size\)/g)?.length).toBeGreaterThanOrEqual(7);
    expect(structuralStyles.match(/font-size:\s*var\(--marketing-card-title-size\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(structuralStyles.match(/font-size:\s*var\(--marketing-body-size\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(structuralStyles.match(/font-size:\s*var\(--marketing-label-size\)/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
