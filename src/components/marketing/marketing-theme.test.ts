import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cssFile(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8").toLowerCase();
}

describe("marketing theme contract", () => {
  it("defines adaptive marketing surfaces and readable foregrounds", () => {
    const css = cssFile("./marketing-page.module.css");

    expect(css).toMatch(/--marketing-canvas:\s*#ffffff/);
    expect(css).toMatch(/--marketing-raised:\s*#f2f2ee/);
    expect(css).toMatch(/--marketing-panel:\s*#f7f6ef/);
    expect(css).toMatch(/--marketing-inverse:\s*#101116/);
    expect(css).toMatch(/--marketing-on-inverse:\s*#f4f4f5/);
    expect(css).toMatch(/\[data-theme="dark"\][\s\S]*--marketing-canvas:\s*#101116/);
    expect(css).toMatch(/\[data-theme="dark"\][\s\S]*--marketing-raised:\s*#1c1d24/);
  });

  it("uses the shared roles for solid headers and mega menus", () => {
    const css = cssFile("./marketing-header.module.css");

    expect(css).toMatch(/background:\s*var\(--marketing-raised,/);
    expect(css).toMatch(/color:\s*var\(--marketing-text,/);
    expect(css).toMatch(/background:\s*var\(--marketing-panel,/);
    expect(css).toMatch(/background:\s*var\(--marketing-overlay,/);
    expect(css).toMatch(/border[^;]*:\s*1px solid var\(--marketing-border,/);
  });

  it("themes every adaptive marketing chapter", () => {
    const adaptiveModules = [
      "./proof-rail.module.css",
      "./manifesto-section.module.css",
      "./surface-runway.module.css",
      "./before-after-section.module.css",
      "./workflow-gallery.module.css",
      "./setup-steps.module.css",
      "./final-cta.module.css",
    ];

    for (const name of adaptiveModules) {
      expect(cssFile(name), name).toMatch(
        /var\(--marketing-(canvas|raised|panel|text|muted|border|inverse|on-inverse|on-accent)/,
      );
    }
  });

  it("preserves branded yellow and dark chapters with readable foregrounds", () => {
    const story = cssFile("./automation-story.module.css");
    const channels = cssFile("./channel-showcase.module.css");
    const faq = cssFile("./faq-section.module.css");
    const footer = cssFile("./marketing-footer.module.css");

    expect(story).toMatch(/color:\s*var\(--marketing-on-volt\)/);
    expect(channels).toMatch(/background:\s*#fff100/);
    expect(channels).toMatch(/color:\s*var\(--marketing-on-volt\)/);
    expect(channels).toMatch(/\.icon\s*{[^}]*background:\s*#ffffff/);
    expect(faq).toMatch(/background:\s*var\(--marketing-inverse\)/);
    expect(faq).toMatch(/color:\s*var\(--marketing-on-inverse\)/);
    expect(footer).toMatch(/background:\s*var\(--marketing-inverse,/);
    expect(footer).toMatch(/color:\s*var\(--marketing-on-inverse,/);
  });
});
