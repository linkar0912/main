import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").toLowerCase();

describe("workspace palette contract", () => {
  it("keeps structural typography on one shared hierarchy", () => {
    expect(css).toMatch(/--type-page-title:\s*clamp\(2rem,\s*3vw,\s*2\.75rem\)/);
    expect(css).toMatch(/--type-section-title:\s*1\.25rem/);
    expect(css).toMatch(/--type-card-title:\s*1rem/);
    expect(css).toMatch(/--type-lede:\s*\.95rem/);
    expect(css).toMatch(/--type-body:\s*\.875rem/);
    expect(css).toMatch(/--type-label:\s*\.75rem/);
    expect(css).toMatch(/--type-meta:\s*\.68rem/);
    expect(css).toMatch(/h1\s*{[^}]*font-size:\s*var\(--type-page-title\)/);
    expect(css).toMatch(/h2\s*{[^}]*font-size:\s*var\(--type-section-title\)/);
    expect(css).toMatch(/h3\s*{[^}]*font-size:\s*var\(--type-card-title\)/);
    expect(css).toMatch(/\.page-lede\s*{[^}]*font-size:\s*var\(--type-lede\)/);
    expect(css).toMatch(/\.eyebrow\s*{[^}]*font-size:\s*var\(--type-meta\)/);
    expect(css).toMatch(/\.field\s*>\s*span\s*{[^}]*font-size:\s*var\(--type-label\)/);
  });

  it("keeps the content canvas and sidebar on the shared panel surface", () => {
    expect(css).toMatch(/\.main-content\s*{[^}]*background:\s*var\(--panel\)/);
    expect(css).toMatch(/\.sidebar\s*{[^}]*background:\s*var\(--panel\)/);
    // The panel token stays white in light mode and flips to graphite in dark mode.
    expect(css).toMatch(/--panel:\s*#ffffff/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*{[^}]*--panel:\s*#1c1d24/);
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

  it("reserves success green for pills that actually moved up", () => {
    // `NeutralPill` renders a bare `.delta-pill` with no data-dir, so a green
    // base rule paints "all time" and "respected" as if they were gains.
    expect(css).not.toMatch(/\.delta-pill\s*{[^}]*var\(--green\)/);
    expect(css).toMatch(/\.delta-pill\[data-dir="up"\]\s*{[^}]*var\(--green\)/);
  });

  it("uses the brand palette by semantic role", () => {
    expect(css).toMatch(/\.quickstart-badge\s*{[^}]*background:\s*var\(--volt\)[^}]*color:\s*var\(--on-volt\)/);
    expect(css).toMatch(/\.bar-participants,\s*\.swatch-participants\s*{[^}]*background:\s*var\(--slate\)/);
    expect(css).toMatch(/\.bar-sent,\s*\.swatch-sent\s*{[^}]*background:\s*var\(--accent\)/);
    expect(css).toMatch(/\.condition-marker,\s*\.guard-marker\s*{[^}]*background:\s*var\(--surface-sunk\)[^}]*color:\s*var\(--slate\)/);
    expect(css).not.toMatch(/\.quickstart-badge\s*{[^}]*var\(--flame\)/);
    expect(css).not.toMatch(/\.bar-participants,\s*\.swatch-participants\s*{[^}]*var\(--grape\)/);
  });

  it("keeps text readable on brand fills in both themes", () => {
    expect(css).toMatch(/--on-accent:\s*#101116/);
    expect(css).toMatch(/--on-volt:\s*#101116/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*{[^}]*--accent-text:\s*#[0-9a-f]{6}/);
    expect(css).toMatch(/\.wizard-progress-step\.is-active \.wizard-progress-index\s*{[^}]*color:\s*var\(--on-accent\)/);
  });

  it("keeps fields and icon controls comfortably tappable", () => {
    expect(css).toMatch(/\.field input,\s*\.field select,\s*\.field textarea\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.icon-button\s*{[^}]*height:\s*40px[^}]*width:\s*40px/);
    expect(css).toMatch(/\.hamburger\s*{[^}]*height:\s*44px[^}]*width:\s*44px/);
    expect(css).toMatch(/\.mobile-topbar\s*{[^}]*min-height:\s*64px/);
    expect(css).toMatch(/@media\s*\(max-width:\s*600px\)\s*{[\s\S]*?\.icon-button\s*{[^}]*height:\s*44px[^}]*width:\s*44px/);
  });

  it("owns spacing at stack and grid boundaries", () => {
    expect(css).toMatch(/\.profile-main\s*>\s*\.panel,\s*\.profile-side\s*>\s*\.panel\s*{[^}]*margin-bottom:\s*0/);
    expect(css).toMatch(/\.settings-grid\s*>\s*\.panel\s*{[^}]*margin-bottom:\s*0/);
    expect(css).toMatch(/\.field-support\s*{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/\.sequence-form-actions\s*{[^}]*justify-content:\s*flex-end/);
  });

  it("contains mobile rows and preserves readable actions", () => {
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.settings-hero\s*{[^}]*align-items:\s*stretch[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.automation-row\s*{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.wizard-progress-label\s*{[^}]*display:\s*inline/);
    expect(css).toMatch(/@media \(max-width:\s*820px\)[\s\S]*?\.wizard-progress-label\s*{[^}]*display:\s*inline/);
    expect(css).toMatch(/\.sequence-submit-actions \.text-link\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.row-identity\s*{[^}]*min-width:\s*0/);
  });

  it("keeps settings cards free of decorative top strips", () => {
    expect(css).not.toMatch(/\.channel-settings-card::before/);
    expect(css).not.toMatch(/\.facebook-settings-card::before/);
    expect(css).not.toMatch(/\.settings-summary-intro\s*{[^}]*border-top/);
  });
});
