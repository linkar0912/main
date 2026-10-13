#!/usr/bin/env node
/**
 * Generates app/public.css: the part of app/globals.css the public website
 * can use.
 *
 * globals.css (~470 KB minified) holds every global rule, almost all of it for
 * the signed-in app. The root layout used to load all of it, render-blocking,
 * on every marketing, legal and auth page. Now the root layout loads only
 * public.css, and the app, owner console and onboarding layouts load the full
 * globals.css on top of it.
 *
 * Why the cascade is unchanged:
 * - public.css is globals.css with rules removed, in the original order.
 * - A rule is removed only when none of its selectors can match on a public
 *   page: every selector names a class that no file reachable from a public
 *   route ever mentions. Rules with no class (element, :root, @font-face,
 *   @keyframes) are always kept.
 * - On app pages globals.css loads after public.css, so every rule appears
 *   again, later, in its original position: the later copy always wins over
 *   its earlier twin, exactly as the single file did.
 *
 * "Mentions" is deliberately generous: any identifier-like token in any
 * source file reachable through imports from a public route, plus prefixes
 * of class names built at runtime (`status-${tone}` keeps every `.status-*`).
 *
 * Run `pnpm css:public` after editing app/globals.css; a unit test fails while
 * public.css is stale.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Route segments under app/ that are not the public website. */
const PRIVATE_APP_DIRECTORIES = new Set(["(app)", "admin", "onboarding", "dev-preview", "api"]);
const ROUTE_FILE = /^(page|layout|template|loading|error|not-found|global-error|default)\.(tsx|ts|jsx|js)$/;
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs"];

export const HEADER = "/* GENERATED from app/globals.css by scripts/build-public-css.mjs - do not edit. Run `pnpm css:public`. */\n";

function publicRouteFiles(root) {
  const out = [];
  const walk = (dir, top) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (top && PRIVATE_APP_DIRECTORIES.has(entry.name)) continue;
        walk(path.join(dir, entry.name), false);
      } else if (ROUTE_FILE.test(entry.name)) {
        out.push(path.join(dir, entry.name));
      }
    }
  };
  walk(path.join(root, "app"), true);
  return out;
}

function resolveImport(root, fromFile, specifier) {
  let base;
  if (specifier.startsWith("@/")) base = path.join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;
  if (/\.(css|svg|png|webp|json)$/.test(base)) return null;
  for (const candidate of [base, ...SOURCE_EXTENSIONS.map((ext) => base + ext), ...SOURCE_EXTENSIONS.map((ext) => path.join(base, `index${ext}`))]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every source file reachable through imports from the public routes. */
export function publicSourceFiles(root = ROOT) {
  const seen = new Set();
  const pending = publicRouteFiles(root);
  const importPattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    const source = fs.readFileSync(file, "utf8");
    for (const [, specifier] of source.matchAll(importPattern)) {
      const resolved = resolveImport(root, file, specifier);
      if (resolved && !seen.has(resolved)) pending.push(resolved);
    }
  }
  return [...seen].sort();
}

function collectTokens(files) {
  const tokens = new Set();
  const prefixes = new Set();
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    for (const [token] of source.matchAll(/[A-Za-z_-][A-Za-z0-9_-]*/g)) {
      tokens.add(token);
      // `name-${x}` or "name-" + x: a class name finished at runtime.
      if (token.endsWith("-") && token.length > 2) prefixes.add(token);
    }
  }
  return { tokens, prefixes: [...prefixes] };
}

/** Splits on commas that are not inside parentheses or brackets. */
function splitTopLevel(text, separator = ",") {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === "(" || char === "[") depth++;
    else if (char === ")" || char === "]") depth--;
    else if (char === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

/** Removes `[...]` and the arguments of functional pseudo-classes, which never make a selector unmatchable. */
function stripConditionalParts(selector) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < selector.length; i++) {
    const char = selector[i];
    if (char === "(" || char === "[") depth++;
    if (depth === 0) out += char;
    if (char === ")" || char === "]") depth--;
  }
  return out;
}

function selectorCanMatch(selector, isKnownClass) {
  const required = stripConditionalParts(selector);
  for (const [, name] of required.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)) {
    if (name.includes("\\")) continue; // Escaped names: keep rather than guess.
    if (!isKnownClass(name)) return false;
  }
  return true;
}

/** Reads one block body starting just after `{`; returns the index just after the matching `}`. */
function blockEnd(css, start) {
  let depth = 1;
  for (let i = start; i < css.length; i++) {
    const char = css[i];
    if (char === '"' || char === "'") {
      const close = css.indexOf(char, i + 1);
      i = close === -1 ? css.length : close;
    } else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return i + 1;
  }
  throw new Error("Unbalanced braces in globals.css");
}

const CONTAINER_AT_RULES = /^@(media|supports|layer|container)\b/;

function filterRules(css, keepSelector) {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf("{", i);
    const semicolon = css.indexOf(";", i);
    if (open === -1) {
      out += css.slice(i).trim() ? css.slice(i) : "";
      break;
    }
    // A statement at-rule (@import, @layer a, b;) ends before the next block.
    if (semicolon !== -1 && semicolon < open && css.slice(i, semicolon).trim().startsWith("@")) {
      out += `${css.slice(i, semicolon + 1).trim()}\n`;
      i = semicolon + 1;
      continue;
    }
    const prelude = css.slice(i, open).trim();
    const end = blockEnd(css, open + 1);
    const body = css.slice(open + 1, end - 1);
    if (CONTAINER_AT_RULES.test(prelude)) {
      const inner = filterRules(body, keepSelector);
      if (inner.trim()) out += `${prelude} {\n${inner}}\n`;
    } else if (prelude.startsWith("@") || splitTopLevel(prelude).some((selector) => keepSelector(selector.trim()))) {
      out += `${prelude} {${body}}\n`;
    }
    i = end;
  }
  return out;
}

export function buildPublicCss(root = ROOT) {
  const { tokens, prefixes } = collectTokens(publicSourceFiles(root));
  const isKnownClass = (name) => tokens.has(name) || prefixes.some((prefix) => name.startsWith(prefix));
  const globals = fs.readFileSync(path.join(root, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  return HEADER + filterRules(globals, (selector) => selectorCanMatch(selector, isKnownClass));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const output = buildPublicCss();
  fs.writeFileSync(path.join(ROOT, "app/public.css"), output);
  const before = fs.statSync(path.join(ROOT, "app/globals.css")).size;
  console.log(`app/public.css: ${(output.length / 1024).toFixed(0)} KB (globals.css is ${(before / 1024).toFixed(0)} KB)`);
}
