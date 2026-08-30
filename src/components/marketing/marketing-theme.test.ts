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
});
