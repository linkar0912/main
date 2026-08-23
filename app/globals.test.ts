import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").toLowerCase();

describe("workspace palette contract", () => {
  it("keeps the content canvas white and the sidebar zinc", () => {
    expect(css).toMatch(/\.main-content\s*{[^}]*background:\s*var\(--white\)/);
    expect(css).toMatch(/\.sidebar\s*{[^}]*background:\s*var\(--surface-soft\)/);
  });

  it("uses Meta blue as the sole interactive brand color", () => {
    expect(css).toMatch(/--accent:\s*#0866ff/);
    expect(css).not.toMatch(/#1877f2|#22c55e|#15803d|#14532d|rgba\(217,\s*119,\s*6/);
  });

  it("reserves red styling for errors and failed statuses", () => {
    expect(css).toMatch(/\.form-error\s*{[^}]*var\(--danger\)/);
    expect(css).toMatch(/\.status-expired,\s*\.status-failed\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.icon-button\.icon-danger:hover\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.signout-button:hover\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.delta-pill\[data-dir="down"\]\s*{[^}]*var\(--danger\)/);
  });
});
