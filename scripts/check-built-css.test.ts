import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { findPrefixOnlyDeclarations } from "./check-built-css.mjs";

const root = path.resolve(__dirname, "..");

describe("findPrefixOnlyDeclarations", () => {
  it("flags a rule that kept only the -webkit- copy, as Lightning CSS emits it", () => {
    const css = ".photo-module__W_MIqq__glass{color:#fff;-webkit-backdrop-filter:blur(18px)saturate(150%);text-align:start}";
    expect(findPrefixOnlyDeclarations(css)).toEqual([
      { selector: ".photo-module__W_MIqq__glass", property: "-webkit-backdrop-filter" },
    ]);
  });

  it("passes a rule that has both declarations", () => {
    expect(findPrefixOnlyDeclarations(".a{-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px)}")).toEqual([]);
    expect(findPrefixOnlyDeclarations(".a{backdrop-filter:none}")).toEqual([]);
  });

  it("checks rules inside @media and @supports, and filter as well", () => {
    const css = [
      "@media (prefers-reduced-transparency:reduce){.a,.b>.c{-webkit-backdrop-filter:none}}",
      "@supports ((-webkit-backdrop-filter:blur(60px)) or (backdrop-filter:blur(60px))){.d{-webkit-filter:blur(2px)}}",
    ].join("");
    expect(findPrefixOnlyDeclarations(css)).toEqual([
      { selector: ".a,.b>.c", property: "-webkit-backdrop-filter" },
      { selector: ".d", property: "-webkit-filter" },
    ]);
  });

  it("ignores the property named in transition values and @supports conditions", () => {
    const css = "@supports (-webkit-backdrop-filter:none){.a{transition:-webkit-backdrop-filter .6s,backdrop-filter .6s}}";
    expect(findPrefixOnlyDeclarations(css)).toEqual([]);
  });

  it("is not thrown off by braces or semicolons in comments, strings and urls", () => {
    const css = [
      '/* .x{-webkit-backdrop-filter:blur(1px)} */',
      '.a{content:"};-webkit-backdrop-filter:x{";backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px)}',
      ".b{background:url(data:image/svg+xml,a{b};c);-webkit-backdrop-filter:blur(3px)}",
    ].join("");
    expect(findPrefixOnlyDeclarations(css)).toEqual([{ selector: ".b", property: "-webkit-backdrop-filter" }]);
  });
});

/**
 * Lightning CSS adds the -webkit- prefix itself, and a hand-written prefixed
 * copy after the unprefixed declaration makes it drop the unprefixed one
 * (see scripts/check-built-css.mjs). Write only the unprefixed property.
 */
describe("source stylesheets", () => {
  it("never hand-write a -webkit- copy of backdrop-filter or filter", () => {
    const prefixed = /-webkit-(?:backdrop-filter|filter)\b/;
    const offenders = ["app", "src"]
      .flatMap((directory) =>
        readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
          .map((entry) => path.join(entry.parentPath, entry.name)),
      )
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
          .split("\n")
          .flatMap((line, index) => (prefixed.test(line) ? [`${path.relative(root, file)}:${index + 1}`] : [])),
      );
    expect(offenders).toEqual([]);
  });
});
