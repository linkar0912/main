import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Static-analysis test for proxy.ts's matcher. Reads the matcher string array
 * out of the proxy.ts file (without executing it, which would require a full
 * Next.js runtime) and asserts every AppShell-rendering page route is covered.
 *
 * Why this matters: each `<AppShell>` page is authenticated-only. Proxy does
 * an optimistic redirect to /login for matched paths, which avoids a full
 * page render on every navigation. Adding a new gated page without updating
 * the matcher is a silent security regression - the page still self-validates
 * via getValidatedSession(), but the optimistic redirect that justified the
 * page being treated as authenticated is missing.
 *
 * For new gated routes, prefer updating the list in proxy.ts and running this
 * test rather than discovering the omission in production.
 */

const REPO_ROOT = join(__dirname, "..");
const APP_ROOT = join(REPO_ROOT, "app");
const PROXY_FILE = join(REPO_ROOT, "proxy.ts");

function listPageFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "api" || entry === "auth") continue;
      out.push(...listPageFiles(full));
    } else if (entry === "page.tsx" || entry === "page.jsx") {
      out.push(full);
    }
  }
  return out;
}

function readMatcher(proxySource: string): string[] {
  const match = proxySource.match(/matcher:\s*\[([\s\S]*?)\]/);
  if (!match) throw new Error("proxy.ts does not export a matcher config object");
  const entries = [...match[1].matchAll(/["'`]([^"'`]+)["'`]/g)].map((entry) => entry[1]);
  return entries;
}

function matcherCoversRoute(matcher: string[], routeSegments: string[]): boolean {
  // Express-style path-to-regexp match used by Next.js: a single matcher entry
  // like "/dashboard/:path*" matches any request whose pathname begins with
  // "/dashboard". We mimic that contract loosely here - good enough to catch
  // obvious drift (a new top-level gated path) without replicating Next.js's
  // full matcher.
  const head = "/" + routeSegments[0];
  return matcher.some((pattern) => pattern.startsWith(head + "/") || pattern.startsWith(head + ":") || pattern === head);
}

describe("proxy.ts matcher coverage", () => {
  const proxySource = readFileSync(PROXY_FILE, "utf8");
  const matcher = readMatcher(proxySource);

  it("covers every AppShell-rendering page", () => {
    const pages = listPageFiles(APP_ROOT);
    const shellPages = pages
      .filter((file) => /AppShell/.test(readFileSync(file, "utf8")))
      .map((file) => file.replace(APP_ROOT + "/", "").replace(/\/page\.tsx?$/, ""));
    const segmentsPerPage = shellPages.map((relative) => relative.split("/"));
    const uncovered = segmentsPerPage.filter((segments) => !matcherCoversRoute(matcher, segments));
    expect(uncovered, `proxy.ts matcher does not cover these gated pages: ${uncovered.map((s) => "/" + s.join("/")).join(", ")}`).toEqual([]);
  });
});