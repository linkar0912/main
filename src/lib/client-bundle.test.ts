import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Packages that must never reach the browser bundle of the public site or the
 * workspace app. zod with its locales added ~60 KB gzipped to Home alone,
 * pulled in by a one-line error helper and a labels module.
 */
const SERVER_ONLY_PACKAGES = ["zod", "@prisma/client", "ioredis", "bullmq"];

const root = resolve(__dirname, "../..");
const extensions = [".tsx", ".ts", ".js", ".mjs"];

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full) : [full];
  });
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null;
  for (const candidate of [base, ...extensions.map((ext) => base + ext), ...extensions.map((ext) => join(base, `index${ext}`))]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Value imports and re-exports only: `import type` / `export type` are erased.
const VALUE_IMPORT = /^\s*(?:import|export)\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gm;

function serverOnlyChains(entry: string): string[] {
  const parent = new Map<string, string | null>([[entry, null]]);
  const queue = [entry];
  const chains: string[] = [];
  while (queue.length) {
    const file = queue.shift()!;
    for (const match of readFileSync(file, "utf8").matchAll(VALUE_IMPORT)) {
      const specifier = match[1] ?? match[2] ?? match[3];
      if (SERVER_ONLY_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
        const chain = [specifier];
        for (let at: string | null | undefined = file; at; at = parent.get(at)) chain.unshift(relative(root, at));
        chains.push(chain.join(" -> "));
      }
      const next = resolveImport(file, specifier);
      if (next && !parent.has(next)) {
        parent.set(next, file);
        queue.push(next);
      }
    }
  }
  return chains;
}

describe("client bundle", () => {
  it("keeps server-only packages out of every client component outside the owner console", () => {
    const clientEntries = [...listFiles(join(root, "src/components")), ...listFiles(join(root, "app"))]
      .filter((file) => /\.(tsx|ts)$/.test(file) && !/\.test\.tsx?$/.test(file))
      .filter((file) => !/\/(admin|dev-preview)\//.test(relative(root, file)))
      .filter((file) => /^\s*["']use client["']/.test(readFileSync(file, "utf8")));

    expect(clientEntries.length).toBeGreaterThan(50);
    expect(clientEntries.flatMap(serverOnlyChains)).toEqual([]);
  });
});
