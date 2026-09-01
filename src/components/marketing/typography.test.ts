import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const marketingPage = readFileSync(new URL("./marketing-page.module.css", import.meta.url), "utf8");
const structuralStyles = [
  "automation-story.module.css",
  "before-after-section.module.css",
  "channel-showcase.module.css",
  "final-cta.module.css",
  "insights-showcase.module.css",
  "manifesto-section.module.css",
  "setup-steps.module.css",
  "surface-runway.module.css",
  "workflow-gallery.module.css",
].map((file) => readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).join("\n");

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
