import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain .mjs build script without type declarations
import { HEADER, buildPublicCss, publicSourceFiles } from "./build-public-css.mjs";

const root = resolve(__dirname, "..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

describe("app/public.css", () => {
  it("is up to date with app/globals.css (run `pnpm css:public` after editing globals.css)", () => {
    expect(read("app/public.css") === buildPublicCss(root)).toBe(true);
  });

  it("keeps the design tokens, dark mode and the public page rules, and drops the app's", () => {
    const css = read("app/public.css");
    expect(css.startsWith(HEADER)).toBe(true);
    expect(css).toMatch(/:root\s*{[^}]*--ink:/);
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toMatch(/\.auth-page-section\b/);
    expect(css).toMatch(/\.legal-page\b/);
    expect(css).not.toMatch(/\.app-shell\b/);
    expect(css).not.toMatch(/\.automation-builder\b/);
    expect(css.length).toBeLessThan(read("app/globals.css").length / 3);
  });

  it("follows imports from the public routes only", () => {
    const files = publicSourceFiles(root).map((file: string) => file.slice(root.length + 1));
    expect(files).toEqual(expect.arrayContaining(["app/page.tsx", "app/login/page.tsx", "src/components/public-page.tsx"]));
    expect(files.some((file: string) => file.startsWith("app/(app)/") || file.startsWith("app/admin/"))).toBe(false);
  });
});

describe("stylesheet wiring", () => {
  it("loads only public.css from the root layout", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain('import "./public.css";');
    expect(layout).not.toContain("globals.css\";");
  });

  it("loads the full globals.css in every non-public layout", () => {
    for (const file of [
      "app/(app)/layout.tsx",
      "app/admin/layout.tsx",
      "app/onboarding/page.tsx",
      "app/dev-preview/workspace/layout.tsx",
      "app/dev-preview/admin/layout.tsx",
      "app/dev-preview/onboarding/page.tsx",
    ]) {
      expect(read(file), file).toMatch(/^import "(\.\.\/)+globals\.css";/m);
    }
  });
});
