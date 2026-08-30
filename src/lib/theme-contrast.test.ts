import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The design tokens are the only place a contrast regression can hide: a single
 * edit to --subtle silently drops thirty rules below WCAG AA at once, and
 * nothing else in the suite would notice. This reads the real stylesheet rather
 * than a copy of the values so it fails when globals.css changes, not when
 * someone forgets to update a fixture.
 */
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector);
  expect(start, `${selector} block not found in globals.css`).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

function token(name: string, scope: string): string {
  const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(scope);
  expect(match, `--${name} is not defined as a hex literal in this scope`).toBeTruthy();
  return match![1]!;
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.04045 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => channel(Number.parseInt(hex.slice(offset, offset + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: string): number {
  const [a, b] = [luminance(foreground), luminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const light = block(":root {");
const dark = block('[data-theme="dark"] {');

describe("token fallbacks", () => {
  it("never disagrees with the token it falls back from", () => {
    // `var(--subtle, #a3a29b)` kept a copy of the pre-AA colour alive in the
    // auth pages long after --subtle itself was retuned. The fallback is inert
    // while the token is defined, so nothing renders wrong - it just sits there
    // waiting to be resurrected by a scope that does not inherit :root.
    for (const [, name, fallback] of css.matchAll(/var\(--([a-z-]+),\s*(#[0-9a-fA-F]{6})\)/g)) {
      expect(token(name!, light).toLowerCase(), `var(--${name}, ${fallback}) disagrees with --${name}`)
        .toBe(fallback!.toLowerCase());
    }
  });
});

// Every surface --subtle text is ever painted on.
const SURFACES = ["canvas", "panel", "surface-soft", "surface-sunk"] as const;

describe("theme contrast", () => {
  for (const [themeName, scope] of [["light", light], ["dark", dark]] as const) {
    describe(themeName, () => {
      for (const surface of SURFACES) {
        it(`keeps --subtle readable on --${surface}`, () => {
          // --subtle carries eyebrows, counts, timestamps and placeholders at
          // .68rem - it is real copy, so AA's 4.5:1 applies.
          expect(contrast(token("subtle", scope), token(surface, scope))).toBeGreaterThanOrEqual(4.5);
        });
      }

      it("keeps --muted readable on --panel", () => {
        expect(contrast(token("muted", scope), token("panel", scope))).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps warning copy readable on --panel", () => {
        expect(contrast(token("warning-ink", scope), token("panel", scope))).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps the default sequence status badge readable", () => {
        // .sequence-status is --paper on --slate; both invert with the theme.
        expect(contrast(token("paper", scope), token("slate", scope))).toBeGreaterThanOrEqual(4.5);
      });

      it("keeps the skeleton shimmer quiet against the canvas it loads over", () => {
        // Not a text ratio - the opposite. A loading block that out-contrasts
        // the page is the dark-mode flash this token pair was added to stop.
        expect(contrast(token("skeleton-base", scope), token("canvas", scope))).toBeLessThan(3);
      });
    });
  }
});
