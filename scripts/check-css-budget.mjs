#!/usr/bin/env node
/**
 * Render-blocking CSS budget for the homepage and /pricing.
 *
 * Run it after `pnpm build`. It reads the prerendered HTML in
 * .next/server/app, finds every stylesheet the page links (plus any inline
 * <style>), and adds up the gzip size of each one at level 6, the default
 * most servers and CDNs use. It fails when a page is over its budget.
 *
 * Why it exists: with Turbopack's default CSS chunking, the catalogue's
 * section styles (photo, phone, zigzag, thread and the rest) were merged into
 * chunks that the homepage and /pricing link, though neither page uses them.
 * That added about 18 to 21 KB gzip of render-blocking CSS to each page.
 * next.config.ts now sets experimental.cssChunking to 'graph'; this check
 * keeps the regression from creeping back.
 *
 * It also lists any catalogue module (a *.module.css file anywhere under
 * src/components/marketing/seo, so the shared mock-ui, seo-section and
 * seo-page styles as well as the sections) whose rules reach these pages.
 * That is a warning, not a failure: the byte budget is what decides.
 *
 * Usage: pnpm check:css-budget [--dist .next]
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOGUE_DIR = "src/components/marketing/seo";
/** Folders holding the rest of the site's CSS modules, for the name clash check below. */
const SOURCE_DIRS = ["src", "app"];

/** Gzip budgets in bytes (1 KB = 1,000 bytes). Live served about 43 KB and 32 KB. */
export const CSS_BUDGETS = [
  { route: "/", html: "server/app/index.html", maxGzipBytes: 45_000 },
  { route: "/pricing", html: "server/app/pricing.html", maxGzipBytes: 34_000 },
];

function parseAttributes(tag) {
  const attributes = {};
  const body = tag.replace(/^<\w+/, "").replace(/\/?>$/, "");
  for (const [, name, doubleQuoted, singleQuoted, bare] of body.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
    attributes[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? bare ?? "";
  }
  return attributes;
}

/**
 * The render-blocking styles of an HTML document: stylesheet links (minus
 * print-only, disabled and alternate ones) and inline <style> blocks.
 */
export function renderBlockingStyles(html) {
  const hrefs = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(tag);
    const rel = (attributes.rel ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("stylesheet") || rel.includes("alternate")) continue;
    if ("disabled" in attributes) continue;
    if ((attributes.media ?? "").trim().toLowerCase() === "print") continue;
    if (attributes.href && !hrefs.includes(attributes.href)) hrefs.push(attributes.href);
  }
  const inline = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(([, css]) => css).filter((css) => css.trim());
  return { hrefs, inline };
}

/** Maps a /_next/... URL (relative or behind an asset prefix) to a file in the build directory. */
export function resolveBuildAsset(distDir, href) {
  const pathname = decodeURIComponent(new URL(href, "http://build.local").pathname);
  const marker = pathname.indexOf("/_next/");
  if (marker === -1) return null;
  return path.join(distDir, pathname.slice(marker + "/_next/".length));
}

export function gzipSize(text) {
  return zlib.gzipSync(text, { level: 6 }).length;
}

/** The *.module.css file names under a folder, recursively. */
function moduleFileNames(dir, { skip } = {}) {
  const names = new Set();
  const walk = (current) => {
    if (!fs.existsSync(current) || current === skip) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".module.css")) names.add(entry.name);
    }
  };
  walk(dir);
  return names;
}

/**
 * Class prefixes Turbopack gives each catalogue module, e.g. `zigzag-module__`
 * or `mock-ui-module__`. The prefix comes from the file name only, so a name
 * that a module outside the catalogue also uses is left out: its rules could
 * belong to either file and would make the warning wrong.
 */
export function catalogueModulePrefixes(root = ROOT) {
  const catalogue = path.join(root, CATALOGUE_DIR);
  const elsewhere = new Set(SOURCE_DIRS.flatMap((dir) => [...moduleFileNames(path.join(root, dir), { skip: catalogue })]));
  return [...moduleFileNames(catalogue)]
    .filter((name) => !elsewhere.has(name))
    .map((name) => `${name.replace(/\.module\.css$/, "")}-module__`)
    .sort();
}

/** The catalogue module prefixes whose class selectors appear in a stylesheet. */
export function findCatalogueModules(css, prefixes) {
  return prefixes.filter((prefix) => {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\.${escaped}[\\w-]+__`).test(css);
  });
}

/**
 * Measures each budgeted page in a build directory.
 * @returns {Array<{ route: string, maxGzipBytes: number, missing?: string, files: Array<{ href: string, rawBytes: number, gzipBytes: number }>, rawBytes: number, gzipBytes: number, catalogueModules: string[], overBudget: boolean }>}
 */
export function measureCssBudgets(distDir, { budgets = CSS_BUDGETS, root = ROOT } = {}) {
  const prefixes = catalogueModulePrefixes(root);
  return budgets.map(({ route, html, maxGzipBytes }) => {
    const htmlPath = path.join(distDir, html);
    if (!fs.existsSync(htmlPath)) {
      return { route, maxGzipBytes, missing: htmlPath, files: [], rawBytes: 0, gzipBytes: 0, catalogueModules: [], overBudget: true };
    }
    const { hrefs, inline } = renderBlockingStyles(fs.readFileSync(htmlPath, "utf8"));
    const files = [];
    const catalogueModules = new Set();
    let missing;
    const add = (href, css) => {
      files.push({ href, rawBytes: Buffer.byteLength(css), gzipBytes: gzipSize(css) });
      for (const name of findCatalogueModules(css, prefixes)) catalogueModules.add(name);
    };
    for (const href of hrefs) {
      const file = resolveBuildAsset(distDir, href);
      if (!file || !fs.existsSync(file)) {
        missing ??= file ?? href;
        continue;
      }
      add(href, fs.readFileSync(file, "utf8"));
    }
    inline.forEach((css, index) => add(`inline <style> #${index + 1}`, css));
    const rawBytes = files.reduce((sum, file) => sum + file.rawBytes, 0);
    const gzipBytes = files.reduce((sum, file) => sum + file.gzipBytes, 0);
    return {
      route,
      maxGzipBytes,
      ...(missing ? { missing } : {}),
      files,
      rawBytes,
      gzipBytes,
      catalogueModules: [...catalogueModules].sort(),
      overBudget: Boolean(missing) || gzipBytes > maxGzipBytes,
    };
  });
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} KB`;

function main() {
  const distArgument = process.argv.indexOf("--dist");
  const distDir = path.resolve(ROOT, distArgument === -1 ? ".next" : process.argv[distArgument + 1] ?? ".next");
  const results = measureCssBudgets(distDir);

  console.log("Render-blocking CSS, gzip level 6 (1 KB = 1,000 bytes)");
  for (const result of results) {
    if (result.missing && result.files.length === 0) {
      console.error(`${result.route}: no build output at ${path.relative(ROOT, result.missing)}. Run pnpm build first.`);
      continue;
    }
    const verdict = result.overBudget ? "OVER BUDGET" : "ok";
    console.log(`${result.route.padEnd(9)} ${kb(result.gzipBytes)} of ${kb(result.maxGzipBytes)} (${result.files.length} files, ${kb(result.rawBytes)} raw) ${verdict}`);
    for (const file of result.files) console.log(`  ${file.href}  ${kb(file.gzipBytes)} gzip, ${kb(file.rawBytes)} raw`);
    if (result.missing) console.error(`  missing stylesheet: ${result.missing}`);
    if (result.catalogueModules.length) {
      console.warn(`  warning: catalogue styles linked: ${result.catalogueModules.map((prefix) => prefix.replace(/__$/, "")).join(", ")}`);
    }
  }

  if (results.some((result) => result.overBudget)) {
    console.error("CSS budget check failed. See experimental.cssChunking in next.config.ts.");
    process.exitCode = 1;
  } else {
    console.log("CSS budget check passed");
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
