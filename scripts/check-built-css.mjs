#!/usr/bin/env node
/**
 * Fails when built CSS keeps a -webkit- prefixed `backdrop-filter` or
 * `filter` declaration without the unprefixed one in the same rule.
 *
 * Next.js compiles every stylesheet with Lightning CSS, which already adds
 * -webkit-backdrop-filter for the Safari versions in the browser targets.
 * Its handler for `filter` and `backdrop-filter` keeps one slot per property
 * whatever the vendor prefix, so a later declaration replaces the earlier
 * one instead of merging with it:
 *
 *   backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
 *
 * builds to `-webkit-backdrop-filter:blur(8px)` alone. Chromium ignores the
 * prefixed property, so the glass loses its blur in Chrome and Edge.
 *
 * Write only the unprefixed property, in declarations, transitions and
 * @supports alike; Lightning CSS adds the prefix. check-built-css.test.ts
 * holds the sources to that, and `pnpm build` runs this script on the output.
 *
 * Usage: node scripts/check-built-css.mjs [directory]   (default .next/static)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Properties whose unprefixed declaration Lightning CSS can drop. */
const CHECKED_PROPERTIES = ["backdrop-filter", "filter"];

/**
 * Blanks out comments, strings and url() contents so braces and semicolons
 * inside them cannot split a rule.
 */
function neutralize(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g, '""')
    .replace(/url\([^)]*\)/gi, "url()");
}

/**
 * Every rule (innermost declaration block) that has `-webkit-<property>`
 * without `<property>`, for each checked property.
 */
export function findPrefixOnlyDeclarations(css) {
  const findings = [];
  for (const [, prelude, body] of neutralize(css).matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const properties = new Set(
      body
        .split(";")
        .map((declaration) => declaration.slice(0, declaration.indexOf(":")).trim().toLowerCase())
        .filter(Boolean),
    );
    for (const property of CHECKED_PROPERTIES) {
      if (properties.has(`-webkit-${property}`) && !properties.has(property)) {
        // A statement such as `@layer a,b;` can sit between rules; keep the selector only.
        findings.push({ selector: prelude.slice(prelude.lastIndexOf(";") + 1).trim(), property: `-webkit-${property}` });
      }
    }
  }
  return findings;
}

function cssFiles(directory) {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const directory = path.resolve(root, process.argv[2] ?? ".next/static");
  if (!fs.existsSync(directory)) {
    console.error(`No build output at ${path.relative(root, directory)}. Run \`next build\` first.`);
    process.exitCode = 1;
    return;
  }

  const files = cssFiles(directory);
  let failures = 0;
  for (const file of files) {
    for (const { selector, property } of findPrefixOnlyDeclarations(fs.readFileSync(file, "utf8"))) {
      failures += 1;
      const unprefixed = property.replace(/^-webkit-/, "");
      console.error(`${path.relative(root, file)}: ${selector} has ${property} without ${unprefixed}`);
    }
  }

  if (failures > 0) {
    console.error(
      "\nChromium only reads the unprefixed property. In the source CSS write only `backdrop-filter`"
        + " (or `filter`) and let Lightning CSS add the -webkit- copy; see scripts/check-built-css.mjs.",
    );
    process.exitCode = 1;
    return;
  }
  console.log(`Built CSS check passed (${files.length} stylesheets)`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
