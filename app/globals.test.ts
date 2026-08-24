import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").toLowerCase();

describe("workspace palette contract", () => {
  it("keeps the content canvas and sidebar on the shared panel surface", () => {
    expect(css).toMatch(/\.main-content\s*{[^}]*background:\s*var\(--panel\)/);
    expect(css).toMatch(/\.sidebar\s*{[^}]*background:\s*var\(--panel\)/);
    // The panel token stays white in light mode and flips to graphite in dark mode.
    expect(css).toMatch(/--panel:\s*#ffffff/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*{[^}]*--panel:\s*#17181e/);
  });

  it("brands with magenta interaction and the volt signature", () => {
    expect(css).toMatch(/--accent:\s*#fa0cf7/);
    expect(css).toMatch(/--volt:\s*#fff100/);
    // Legacy palettes must not leak back in: Meta blue, tailwind green, old DM
    // Setu amber, and the pre-rebrand Signal Blue this system replaced.
    expect(css).not.toMatch(/#0866ff|#1877f2|#22c55e|#15803d|#14532d|rgba\(217,\s*119,\s*6|rgba\(8,\s*102,\s*255|#0a6cff|#0857d6|rgba\(10,\s*108,\s*255/);
  });

  it("reserves red styling for errors and failed statuses", () => {
    expect(css).toMatch(/\.form-error\s*{[^}]*var\(--danger\)/);
    expect(css).toMatch(/\.status-expired,\s*\.status-failed\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.icon-button\.icon-danger:hover\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.signout-button:hover\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.delta-pill\[data-dir="down"\]\s*{[^}]*var\(--danger\)/);
  });
});

