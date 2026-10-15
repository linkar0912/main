import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CSS_BUDGETS,
  catalogueModulePrefixes,
  findCatalogueModules,
  gzipSize,
  measureCssBudgets,
  renderBlockingStyles,
  resolveBuildAsset,
} from "./check-css-budget.mjs";

const temporaryRoots: string[] = [];

async function createFixture(files: Record<string, string>) {
  const root = await mkdtemp(path.join(tmpdir(), "linkar-css-budget-"));
  temporaryRoots.push(root);
  for (const [relativePath, contents] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, contents, "utf8");
  }
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("render-blocking CSS budget", () => {
  it("budgets the homepage at 45 KB and /pricing at 34 KB of gzip", () => {
    expect(CSS_BUDGETS.map(({ route, maxGzipBytes }) => [route, maxGzipBytes])).toEqual([
      ["/", 45_000],
      ["/pricing", 34_000],
    ]);
  });

  it("counts stylesheet links and inline styles, but not preloads, print or alternate sheets", () => {
    const html = [
      '<link rel="stylesheet" href="/_next/static/chunks/a.css" data-precedence="next"/>',
      "<link data-precedence='next' href='/_next/static/chunks/b.css' rel='stylesheet'>",
      '<link rel="stylesheet" href="/_next/static/chunks/a.css"/>',
      '<link rel="preload" as="style" href="/_next/static/chunks/c.css"/>',
      '<link rel="stylesheet" media="print" href="/_next/static/chunks/d.css"/>',
      '<link rel="alternate stylesheet" href="/_next/static/chunks/e.css"/>',
      "<style>.x{color:red}</style><style> </style>",
    ].join("");

    expect(renderBlockingStyles(html)).toEqual({
      hrefs: ["/_next/static/chunks/a.css", "/_next/static/chunks/b.css"],
      inline: [".x{color:red}"],
    });
  });

  it("maps relative and asset-prefixed URLs into the build directory", () => {
    expect(resolveBuildAsset("/build", "/_next/static/chunks/a.css?v=1")).toBe(path.join("/build", "static/chunks/a.css"));
    expect(resolveBuildAsset("/build", "https://cdn.example/_next/static/chunks/b.css")).toBe(path.join("/build", "static/chunks/b.css"));
    expect(resolveBuildAsset("/build", "/fonts.css")).toBeNull();
  });

  it("names the catalogue modules whose rules reach a page, sections and shared ones alike", async () => {
    const root = await createFixture({
      "src/components/marketing/seo/sections/benefits/zigzag.module.css": "",
      "src/components/marketing/seo/sections/overview/zigzag-visual.module.css": "",
      "src/components/marketing/seo/sections/hero/hero.module.css": "",
      "src/components/marketing/seo/mock-ui.module.css": "",
      "src/components/marketing/seo/seo-section.module.css": "",
      "src/components/marketing/hero-section.module.css": "",
    });
    const prefixes = catalogueModulePrefixes(root);

    expect(prefixes).toEqual(["hero-module__", "mock-ui-module__", "seo-section-module__", "zigzag-module__", "zigzag-visual-module__"]);
    expect(
      findCatalogueModules(
        ".zigzag-module__W_MIqq__row{gap:0}.mock-ui-module__Xy12__frame{gap:0}.hero-section-module__a1__hero{gap:0}",
        prefixes,
      ),
    ).toEqual(["mock-ui-module__", "zigzag-module__"]);
  });

  it("leaves out a catalogue module name that a module elsewhere also uses", async () => {
    const root = await createFixture({
      "src/components/marketing/seo/sections/related/cards.module.css": "",
      "src/components/marketing/seo/sections/cta/photo.module.css": "",
      "src/components/dashboard/cards.module.css": "",
      "app/(app)/photo.module.css": "",
      "src/components/marketing/seo/sections/steps/timeline.module.css": "",
    });

    expect(catalogueModulePrefixes(root)).toEqual(["timeline-module__"]);
  });

  it("passes a page within budget and fails one over it or with a missing stylesheet", async () => {
    const small = ".a{color:red}";
    const root = await createFixture({
      ".next/server/app/index.html": '<link rel="stylesheet" href="/_next/static/chunks/small.css"/>',
      ".next/server/app/pricing.html": '<link rel="stylesheet" href="/_next/static/chunks/small.css"/><link rel="stylesheet" href="/_next/static/chunks/gone.css"/>',
      ".next/static/chunks/small.css": small,
    });
    const [home, pricing] = measureCssBudgets(path.join(root, ".next"), { root });

    expect(home).toMatchObject({ route: "/", gzipBytes: gzipSize(small), overBudget: false, catalogueModules: [] });
    expect(pricing.overBudget).toBe(true);
    expect(pricing.missing).toContain("gone.css");

    const [tight] = measureCssBudgets(path.join(root, ".next"), {
      root,
      budgets: [{ route: "/", html: "server/app/index.html", maxGzipBytes: 1 }],
    });
    expect(tight.overBudget).toBe(true);
  });

  it("fails when the build output is missing", async () => {
    const root = await createFixture({});
    const results = measureCssBudgets(path.join(root, ".next"), { root });

    expect(results.every((result) => result.overBudget && result.missing)).toBe(true);
  });
});
