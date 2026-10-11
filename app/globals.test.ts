import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8").toLowerCase();

describe("workspace palette contract", () => {
  it("keeps structural typography on one shared hierarchy", () => {
    expect(css).toMatch(/--type-page-title:\s*clamp\(2rem,\s*3vw,\s*2\.75rem\)/);
    expect(css).toMatch(/--type-section-title:\s*1\.125rem/);
    expect(css).toMatch(/--type-card-title:\s*1rem/);
    expect(css).toMatch(/--type-lede:\s*\.95rem/);
    expect(css).toMatch(/--type-body:\s*\.9375rem/);
    expect(css).toMatch(/--type-label:\s*\.875rem/);
    expect(css).toMatch(/--type-meta:\s*\.8125rem/);
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
    expect(css).toMatch(/\.status-expired,\s*\.status-failed\s*{[^}]*var\(--status-danger-fill\)[^}]*var\(--status-danger-text\)/);
    expect(css).not.toMatch(/\.icon-button\.icon-danger:hover\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.signout-button:hover\s*{[^}]*var\(--danger\)/);
    expect(css).not.toMatch(/\.delta-pill\[data-dir="down"\]\s*{[^}]*var\(--danger\)/);
  });

  it("shows a rising trend with a green arrow, not green text on a mint pill", () => {
    // `NeutralPill` renders a bare `.delta-pill` with no data-dir; neither it
    // nor an upward delta may paint the number green.
    expect(css).not.toMatch(/\.delta-pill\s*{[^}]*var\(--(green|leaf|status-ok)/);
    expect(css).toMatch(/\.delta-pill\[data-dir="up"\]\s*{[^}]*background:\s*transparent[^}]*color:\s*var\(--ink\)/);
    expect(css).toMatch(/\.delta-pill\[data-dir="up"\] svg\s*{[^}]*color:\s*var\(--status-ok\)/);
    expect(css).toMatch(/\.stat-delta\[data-dir="up"\]\s*{[^}]*background:\s*transparent[^}]*color:\s*var\(--ink\)/);
  });

  // "The green on white looks weird": every healthy row used to be a mint pill
  // with green text, so whole screens became fields of chips that drowned the
  // one real problem. Normal states are now a dot and a word in the text
  // colour; only warning and danger get a filled chip.
  describe("status colour: quiet when fine, loud when not", () => {
    const rules = (css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+{[^{}]*}/g) ?? []).map((rule) => {
      const [selector, body] = rule.split("{");
      return { selector: selector.trim(), body };
    });
    // The automation builder and its previews are being redesigned separately
    // and keep their own markers until they adopt the shared badge.
    const builder = /\.(builder|wizard|ig-|facebook-preview|template-picker|media-picker|qa-)/;
    const owned = rules.filter((rule) => !builder.test(rule.selector) && !rule.selector.startsWith("--"));

    it("gives success and neutral badges no fill, border or coloured text", () => {
      expect(css).toMatch(/\.status-chip\s*{[^}]*background:\s*transparent[^}]*color:\s*var\(--ink\)/);
      expect(css).not.toMatch(/\.status-chip\.is-(success|neutral)\s*{/);
      expect(css).toMatch(/\.status-chip\.is-success \.status-chip-dot\s*{[^}]*background:\s*var\(--status-ok\)/);
      expect(css).toMatch(/\.status-chip-dot\s*{[^}]*background:\s*var\(--status-neutral\)[^}]*height:\s*8px[^}]*width:\s*8px/);
    });

    it("fills only warning and danger chips, with darker matching text", () => {
      expect(css).toMatch(/\.status-chip\.is-warning\s*{[^}]*background:\s*var\(--status-warning-fill\)[^}]*color:\s*var\(--status-warning-text\)/);
      expect(css).toMatch(/\.status-chip\.is-danger\s*{[^}]*background:\s*var\(--status-danger-fill\)[^}]*color:\s*var\(--status-danger-text\)/);
      for (const theme of [/:root\s*{([^}]*--status-ok[^}]*)}/, /\[data-theme="dark"\]\s*{([^}]*--status-warning-fill[^}]*)}/]) {
        const block = css.match(theme)?.[1] ?? "";
        expect(block).toMatch(/--status-warning-fill:\s*#[0-9a-f]{6}/);
        expect(block).toMatch(/--status-danger-text:\s*#[0-9a-f]{6}/);
      }
    });

    it("uses a success green that sits beside magenta, light and dark", () => {
      expect(css).toMatch(/:root\s*{[^}]*--leaf:\s*#12b76a/);
      expect(css).toMatch(/\[data-theme="dark"\]\s*{[^}]*--leaf:\s*#32d583/);
      expect(css).not.toMatch(/#0f7b3f|#008a68|#55ddb0|#62e6b9/);
      expect(css).not.toMatch(/--green(-soft|-line)?:/);
    });

    it("never tints a card, panel or chip green", () => {
      const tinted = owned.filter((rule) => /var\(--(leaf-soft|leaf-line|green-soft|green-line|mint)\)/.test(rule.body));
      expect(tinted.map((rule) => rule.selector)).toEqual([]);
    });

    it("never colours text green; only dots and small icons carry the green", () => {
      const greenText = owned.filter((rule) =>
        /(^|[;\s{])color:\s*var\(--(leaf|green|success|success-ink|status-ok|mint)\)/.test(rule.body)
        && !/(svg|icon)\s*$/.test(rule.selector.split(",").at(-1) ?? ""));
      expect(greenText.map((rule) => rule.selector)).toEqual([]);
    });

    it("reads confirmations in the text colour with a check", () => {
      expect(css).toMatch(/\.form-success\s*{[^}]*color:\s*var\(--ink\)/);
      expect(css).toMatch(/\.form-success:not\(:has\(svg\)\)::before\s*{[^}]*background:\s*var\(--status-ok\)/);
      expect(css).toMatch(/\.notice-success\s*{[^}]*background:\s*var\(--surface-soft\)/);
      expect(css).toMatch(/\.admin-message\.form-success\s*{[^}]*background:\s*var\(--surface-soft\)[^}]*color:\s*var\(--ink\)/);
    });
  });

  it("uses the brand palette by semantic role", () => {
    expect(css).toMatch(/\.quickstart-badge\s*{[^}]*background:\s*var\(--volt\)[^}]*color:\s*var\(--on-volt\)/);
    expect(css).toMatch(/\.bar-participants,\s*\.swatch-participants\s*{[^}]*background:\s*var\(--slate\)/);
    expect(css).toMatch(/\.bar-sent,\s*\.swatch-sent\s*{[^}]*background:\s*var\(--accent\)/);
    expect(css).toMatch(/\.condition-marker,\s*\.guard-marker\s*{[^}]*background:\s*var\(--surface-sunk\)[^}]*color:\s*var\(--slate\)/);
    expect(css).not.toMatch(/\.quickstart-badge\s*{[^}]*var\(--flame\)/);
    expect(css).not.toMatch(/\.bar-participants,\s*\.swatch-participants\s*{[^}]*var\(--grape\)/);
    expect(css).not.toMatch(/var\(--surface\)/);
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
    expect(css).toMatch(/\.header-actions\s*{[^}]*flex-shrink:\s*0/);
    expect(css).toMatch(/@media \(max-width:\s*820px\)[\s\S]*?\.automation-row\s*{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.settings-hero\s*{[^}]*align-items:\s*stretch[^}]*flex-direction:\s*column/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.automation-row\s*{[^}]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.wizard-progress-label\s*{[^}]*display:\s*none/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.wizard-progress-step\.is-active \.wizard-progress-label\s*{[^}]*display:\s*inline/);
    expect(css).toMatch(/@media \(max-width:\s*820px\)[\s\S]*?\.wizard-progress-label\s*{[^}]*display:\s*inline/);
    expect(css).toMatch(/\.sequence-submit-actions \.text-link\s*{[^}]*min-height:\s*44px/);
    expect(css).toMatch(/\.row-identity\s*{[^}]*min-width:\s*0/);
  });

  it("keeps builder overlays inside an iPhone viewport", () => {
    // Page-level entrance animations must not keep holding a transform once
    // they finish: a held transform turns the wrapper into the containing
    // block for position: fixed, so the phone preview sheet (and any other
    // full-screen layer inside the page) would scroll away with the page.
    for (const wrapper of [/\.app-content-slot > \*/, /\.auto-detail-body > \*/, /\.automation-section-body/, /\.prefs-section/, /:is\(\.workspace-panel, \.ibx-panel\):not\(\[hidden\]\)/]) {
      const rule = new RegExp(`${wrapper.source}\\s*{[^}]*animation:\\s*motion-fade-up[^;}]*`).exec(css)?.[0] ?? "";
      expect(rule).toMatch(/backwards/);
      expect(rule).not.toMatch(/\bboth\b/);
    }
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.action-notice\s*{[^}]*left:\s*14px[^}]*right:\s*14px[^}]*transform:\s*none[^}]*width:\s*auto/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.builder-preview\.is-open\s*{[^}]*height:\s*100dvh[^}]*inset:\s*0/);
    // The preview phone keeps a real iPhone's 393:852 screen everywhere and
    // shrinks as one piece (zoom) instead of being re-laid-out smaller.
    expect(css).toMatch(/\.builder-preview :is\(\.ig-device, \.facebook-device\)\s*{[^}]*width:\s*318px[^}]*zoom:\s*var\(--phone-zoom/);
    expect(css).toMatch(/\.builder-preview :is\(\.ig-phone, \.facebook-phone\)\s*{[^}]*aspect-ratio:\s*393 \/ 852[^}]*height:\s*auto/);
    expect(css).not.toMatch(/\.builder-preview[^{]*\.(ig|facebook)-phone\s*{[^}]*height:\s*(min|var|calc)\(/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.template-picker\s*{[^}]*height:\s*100dvh/);
    expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.template-picker-categories\s*{[^}]*flex-wrap:\s*nowrap[^}]*overflow-x:\s*auto/);
  });

  it("keeps settings cards free of decorative top strips", () => {
    expect(css).not.toMatch(/\.channel-settings-card::before/);
    expect(css).not.toMatch(/\.facebook-settings-card::before/);
    expect(css).not.toMatch(/\.settings-summary-intro\s*{[^}]*border-top/);
  });

  // Hovering used to slide a flat grey slab in behind rows and controls - the
  // automation row, every sidebar link, the icon buttons. It read as cheap and
  // it fought the accent-soft fill that marks the *active* nav item. Hover now
  // signals with colour and border only; the neutral fill tokens are banned
  // from :hover so the slab cannot creep back one rule at a time.
  it("never paints a neutral grey panel on hover", () => {
    const hoverRules = css.match(/[^{}]*:hover[^{]*{[^}]*}/g) ?? [];
    expect(hoverRules.length).toBeGreaterThan(0);
    const greyFilled = hoverRules.filter((rule) =>
      /background(-color)?:\s*var\(--(hover-wash|surface-soft|surface-sunk)\)/.test(rule),
    );
    expect(greyFilled).toEqual([]);
    // The token existed only to fill those hovers, so it goes with them.
    expect(css).not.toMatch(/--hover-wash/);
  });

  // The delivery-issue rows previously leaned on .activity-row, which boxed only
  // the badge line and left the explanation hanging outside the border, and on
  // .sequence-status, whose neutral slate fill made a retryable warning look
  // inert. Both surfaces now share one row treatment with real status colour.
  it("gives delivery failures their own danger and warning treatment", () => {
    expect(css).toMatch(/\.failure-list\s*{/);
    expect(css).toMatch(/\.failure-row\s*{[^}]*display:\s*grid/);
    expect(css).toMatch(/\.activity-summary\s*{/);
    expect(css).toMatch(/\.failure-badge\s*{[^}]*var\(--danger/);
    expect(css).toMatch(/\.failure-state\[data-state="failed"\]\s*{[^}]*var\(--honey-soft\)/);
    expect(css).toMatch(/\.failure-state\[data-state="failed"\]\s*{[^}]*var\(--warning-ink\)/);
  });

  // 743 and its delta pill used to float in a half-empty tile: the block set a
  // 6px flex gap and the value row added another 7px margin on top, then
  // centre-aligned a small pill against a 1.85rem number.
  it("sits the stat value and its delta pill on one baseline", () => {
    expect(css).toMatch(/\.stat-value-row\s*{[^}]*align-items:\s*baseline/);
    expect(css).not.toMatch(/\.stat-value-row\s*{[^}]*margin-top/);
  });

  // Every participant row carried a full-width uppercase "DELIVERY DETAILS"
  // strip with the disclosure marker hidden and no chevron, so a working
  // accordion read as an empty section header and doubled each row's height.
  it("keeps the delivery-details disclosure reading as a control", () => {
    expect(css).toMatch(/\.row-detail-toggle\s*{[^}]*display:\s*flex/);
    expect(css).not.toMatch(/\.row-detail-toggle\s*{[^}]*text-transform:\s*uppercase/);
    expect(css).toMatch(/\.row-detail\[open\]\s*\.row-detail-chevron\s*{[^}]*rotate\(90deg\)/);
    expect(css).toMatch(/\.journey-caption\s*{/);
  });

  it("uses separators only at meaningful section boundaries", () => {
    expect(css).toMatch(/\.ibx-desk\s*{[^}]*border:\s*1px solid var\(--line\)/);
    expect(css).toMatch(/\.ibx-list\s*{[^}]*border-right:\s*1px solid var\(--line\)/);
    expect(css).not.toMatch(/\.ibx-bubble\s*{[^}]*border-bottom/);
    expect(css).not.toMatch(/\.insights-metrics\s*{[^}]*border-block/);
    expect(css).not.toMatch(/\.insights-journey li\s*{[^}]*border/);
    expect(css).not.toMatch(/\.facebook-activity-header\s*{[^}]*border/);
    expect(css).not.toMatch(/\.facebook-activity-row\s*{[^}]*border/);
    expect(css).not.toMatch(/\.stat-block\s*{[^}]*border-left/);
    expect(css).not.toMatch(/\.page-picker\s*{[^}]*border-top/);
    expect(css).not.toMatch(/\.channel-health\s*{[^}]*border-top/);
  });

  it("uses consistent separators and stable geometry on the reported workspace surfaces", () => {
    expect(css).toMatch(/\.stat-row\s*{[^}]*display:\s*grid[^}]*gap:\s*var\(--space-5\)/);
    expect(css).not.toMatch(/\.stat-row\s*{[^}]*border-top/);
    expect(css).toMatch(/\.insights-metrics\s*{[^}]*grid-template-columns:\s*repeat\(4/);
    expect(css).toMatch(/\.insights-metric\s*{[^}]*min-width:\s*0/);
    expect(css).not.toMatch(/\.insights-metric\s*{[^}]*(?:background|border|border-radius):/);
    expect(css).not.toMatch(/\.insights-metric::before\s*{/);
    expect(css).not.toMatch(/\.insights-metric\s*\+\s*\.insights-metric\s*{[^}]*border-left/);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.insights-metrics\s*{[^}]*grid-template-columns:\s*repeat\(2/);
    expect(css).toMatch(/\.contact-row\s*{[^}]*transition:\s*none/);
    expect(css).not.toMatch(/\.contact-row:hover\s*{[^}]*background/);
    expect(css).toMatch(/\.connected-channels-total \.health-orb\s*{[^}]*flex:\s*0 0 8px[^}]*height:\s*8px[^}]*width:\s*8px/);
    expect(css).toMatch(/\.connected-channels-list\s*{[^}]*grid-template-columns:\s*repeat\(2/);
    expect(css).toMatch(/@media\s*\(max-width:\s*1080px\)[\s\S]*?\.connected-channels-list\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.ibx-desk\s*{[^}]*grid-template-columns:\s*minmax\(300px,\s*360px\) minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.ibx-messages\s*{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.ibx-list-body\s*{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/@media\s*\(max-width:\s*900px\)[\s\S]*?\.ibx-desk\s*{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(css).toMatch(/\.contact-row\s*{[^}]*border-bottom:\s*1px solid var\(--line\)/);
    expect(css).toMatch(/\.funnel-cell\s*{[^}]*min-height:\s*112px/);
  });

  it("keeps the Instagram DM preview on the dark phone screen, not a page token", () => {
    // The mock's header and composer are white-on-dark; a page background token
    // (grey, later white) made them invisible.
    expect(css).toMatch(/\.ig-screen-dm\s*{[^}]*background:\s*#000/);
  });

  it("lifts danger text to a readable tone in dark mode and keeps danger buttons legible", () => {
    const darkBlock = css.match(/\[data-theme="dark"\]\s*{([^}]*)}/)?.[1] ?? "";
    expect(darkBlock).toMatch(/--danger:\s*#ff8a80/);
    expect(css).toMatch(/\[data-theme="dark"\]\s*\.button-danger\s*{[^}]*color:\s*#101116/);
  });

  it("shows not-allowed on disabled buttons and keeps the busy cursor for work in progress", () => {
    expect(css).toMatch(/button:disabled\s*{[^}]*cursor:\s*not-allowed/);
    expect(css).toMatch(/button:disabled\[aria-busy="true"\][^{]*{[^}]*cursor:\s*wait/);
  });

  it("keeps admin dialog actions reachable on short screens", () => {
    expect(css).toMatch(/\.admin-dialog-backdrop\s*{[^}]*overflow-y:\s*auto/);
    // The dialog is capped to the screen; its body scrolls while the title and
    // the Cancel / confirm footer stay pinned.
    expect(css).toMatch(/\.admin-reason-dialog\s*{[^}]*max-height:\s*calc\(100dvh/);
    expect(css).toMatch(/\.admin-dialog-body\s*{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.admin-reason-dialog \.admin-dialog-foot\s*{[^}]*flex:\s*0 0 auto/);
  });

  it("hides the skip link until it receives focus", () => {
    expect(css).toMatch(/\.skip-link\s*{[^}]*transform:\s*translatey\(-200%\)/);
    expect(css).toMatch(/\.skip-link:focus\s*{[^}]*transform:\s*none/);
  });
});

// "I don't want that grey bg selected tile - I don't have grey bg anywhere."
// Selected, current, active and hovered things used to sit on a soft ink or
// accent tint (sidebar, Settings/Help navs, menus, rows, template
// categories). Selection now shows with ink text, an ink underline, an ink
// outline or - for vertical navigation only (Round 6, the owner's "Mondays"
// reference) - a white tile: the panel colour with a hairline and a very soft
// shadow. The only fills a state may use are solid ink/accent (switch thumbs,
// toggles, primary buttons), the panel colour, or that tile.
describe("selection style: never a grey fill", () => {
  const rules = (css.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+{[^{}]*}/g) ?? []).map((rule) => {
    const [selector, body] = rule.split("{");
    return { selector: selector.trim().replace(/\s+/g, " "), body };
  });
  const state = /:hover|:focus|\.is-(active|selected|on|current|open|focused)\b|\[aria-(current|selected|pressed|checked|expanded)|:checked/;
  // Status dots (e.g. the inbox's "reply window open" marker) carry a status
  // colour by design; that is a state indicator, not a selection fill.
  const allowed = /^(transparent|none|var\(--(panel|canvas|paper|ink|ink-strong|accent|accent-hover|white|danger|select-bar|select-line|status-ok|status-warning|status-danger)\)|#101116|#fff|#ffffff)$/;
  // Where the white tile may appear: vertical-nav items, and the keyboard's
  // place in a menu or the ⌘K palette (the same tile, with a focus hairline).
  const tileOwner = /(\.nav-item|\.sidebar-link|\.settings-nav-link|\.section-nav-link|\.template-picker-category|\.menu-item|\.account-menu-item|\.admin-menu-list > button|\.palette-option)\b/;
  // Splits a selector list at its top-level commas (not inside :is() / :not()).
  const selectorList = (selector: string) => {
    const parts: string[] = [];
    let depth = 0;
    let current = "";
    for (const char of selector) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
      } else current += char;
    }
    return [...parts, current.trim()].filter(Boolean);
  };
  const navContainer = /:is\(\.nav-list, \.sidebar-nav, \.settings-nav, \.section-nav, \.template-picker-categories\)\[style\*="--thumb-w"\]::before$/;

  it("never fills a selected, current, active or hovered thing with a tint", () => {
    const offenders = rules.flatMap((rule) => {
      if (rule.selector.startsWith("@")) return [];
      const parts = selectorList(rule.selector).filter((part) => state.test(part));
      if (parts.length === 0) return [];
      const values = [...rule.body.matchAll(/background(?:-color)?:\s*([^;]+)/g)].map((match) => match[1].replace(/!important/, "").trim());
      // Volt belongs to the plan sticker (and the billing "save" badge) only.
      const volt = parts.every((part) => /plan-tag|segmented-badge/.test(part));
      const tile = parts.every((part) => tileOwner.test(part));
      return values
        .filter((value) => !allowed.test(value) && !(volt && value === "var(--volt)") && !(tile && value === "var(--select-tile-bg)"))
        .map((value) => `${rule.selector} => ${value}`);
    });
    expect(offenders).toEqual([]);
  });

  it("keeps the white tile to vertical navigation, menus and the palette", () => {
    const users = rules.filter((rule) => /var\(--select-tile-bg\)/.test(rule.body) && !rule.selector.startsWith(":root") && !rule.selector.startsWith("[data-theme"));
    expect(users.length).toBeGreaterThan(2);
    for (const rule of users) {
      const ok = navContainer.test(rule.selector) || selectorList(rule.selector).every((part) => tileOwner.test(part));
      expect(ok, rule.selector).toBe(true);
    }
  });

  it("retires the soft nav fill token", () => {
    expect(css).not.toMatch(/--nav-active-fill/);
  });

  it("draws the tile from the panel colour, a hairline and a very soft shadow, raised slightly in dark mode", () => {
    expect(css).toMatch(/:root\s*{[^}]*--select-tile-bg:\s*var\(--panel\)/);
    expect(css).toMatch(/:root\s*{[^}]*--select-tile-line:\s*var\(--line-strong\)/);
    expect(css).toMatch(/:root\s*{[^}]*--select-tile-radius:\s*10px/);
    const shadow = css.match(/:root\s*{[^}]*--select-tile-shadow:\s*([^;]+);/)?.[1] ?? "";
    const alphas = [...shadow.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map((match) => Number(match[1]));
    expect(alphas.length).toBeGreaterThan(0);
    expect(Math.max(...alphas)).toBeLessThanOrEqual(0.08);
    // Dark mode: a few percent lighter than the panel, never a grey token.
    const dark = css.match(/\[data-theme="dark"\]\s*{[^}]*--select-tile-bg:\s*([^;]+);/)?.[1] ?? "";
    expect(dark).toMatch(/^color-mix\(in srgb, var\(--panel\) (8[5-9]|9\d)%, white\)$/);
    expect(css).not.toMatch(/--select-tile-bg:\s*var\(--(surface-soft|surface-sunk|line)/);
  });

  it("paints sliding indicators in ink, never a tint; vertical navs slide the white tile", () => {
    const thumbs = rules.filter((rule) => /\[style\*="--thumb-w"\]::(before|after)$/.test(rule.selector) && /background:/.test(rule.body));
    expect(thumbs.length).toBeGreaterThan(2);
    for (const thumb of thumbs) {
      if (navContainer.test(thumb.selector)) expect(thumb.body).toMatch(/background:\s*var\(--select-tile-bg\)/);
      else expect(thumb.body).toMatch(/background:\s*var\(--(ink|select-line)\)/);
    }
  });

  it("marks vertical navigation with the white tile that glides on transform, not a magenta bar", () => {
    const tile = rules.find((rule) => navContainer.test(rule.selector))?.body ?? "";
    expect(tile).toMatch(/background:\s*var\(--select-tile-bg\)/);
    expect(tile).toMatch(/border:\s*1px solid var\(--select-tile-line\)/);
    expect(tile).toMatch(/border-radius:\s*var\(--select-tile-radius\)/);
    expect(tile).toMatch(/box-shadow:\s*var\(--select-tile-shadow\)/);
    expect(tile).toMatch(/transform:\s*translate\(var\(--thumb-x\), var\(--thumb-y\)\)/);
    expect(tile).toMatch(/transition:\s*var\(--thumb-motion,\s*transform var\(--dur-3\) var\(--ease-emph\)/);
    // Behind the items, and nothing but the transform (and opacity) animates.
    expect(tile).toMatch(/z-index:\s*-1/);
    expect(tile).not.toMatch(/clip-path|select-bar/);
    expect(tile).not.toMatch(/transition:[^;]*(width|height|top|left)/);
    // No vertical nav draws the old magenta bar any more.
    const bars = rules.filter((rule) => /(nav-item|sidebar-link|settings-nav-link|section-nav-link|template-picker-category|nav-list|sidebar-nav|settings-nav|section-nav|template-picker-categories)/.test(rule.selector)
      && /background:\s*var\(--select-bar\)/.test(rule.body));
    expect(bars.map((rule) => rule.selector)).toEqual([]);
    // Selected text and icon are ink, not magenta.
    expect(css).toMatch(/\.sidebar-link\.is-active svg,\s*\.sidebar-link\.is-active:hover svg\s*{[^}]*color:\s*var\(--ink\)/);
    expect(css).toMatch(/:is\(\.nav-item, \.sidebar-link, \.settings-nav-link, \.section-nav-link, \.template-picker-category\):is\(\.is-active,[^{]*\) svg\s*{\s*color:\s*var\(--ink\)/);
  });

  it("puts the menu and palette keyboard focus on the tile with a hairline that reads", () => {
    expect(css).toMatch(/--select-tile-focus-line:\s*color-mix\(in srgb, var\(--ink\) [4-9]\d%, var\(--panel\)\)/);
    expect(css).toMatch(/:is\(\.menu-item, \.account-menu-item, \.admin-menu-list > button\):focus-visible:not\(:disabled\)\s*{[^}]*background:\s*var\(--select-tile-bg\)[^}]*var\(--select-tile-focus-line\)/);
    expect(css).toMatch(/\.palette-option\[aria-selected="true"\]\s*{[^}]*background:\s*var\(--select-tile-bg\)/);
    expect(css).not.toMatch(/\.palette-option\[aria-selected="true"\]::before/);
  });

  it("underlines horizontal tabs in ink and outlines chosen cards", () => {
    expect(css).toMatch(/--select-line:\s*var\(--ink\)/);
    expect(css).toMatch(/\.tab-underline > :is\(\.is-active,[^)]*\)\s*{[^}]*color:\s*var\(--ink\)[^}]*font-weight:\s*700/);
    expect(css).toMatch(/\.select-outline:is\(\.is-selected,[^{]*{[^}]*background:\s*var\(--panel\)[^}]*border-color:\s*var\(--select-line\)/);
    expect(css).toMatch(/\.select-rail:is\(\.is-selected,[^{]*{[^}]*box-shadow:\s*inset var\(--select-bar-w\) 0 0 var\(--select-bar\)/);
  });

  it("keeps the segmented track and ID chips unfilled", () => {
    expect(css).toMatch(/\.segmented\s*{\s*background:\s*transparent;\s*border:\s*1px solid var\(--line-strong\)/);
    expect(css).toMatch(/\.id-chip code\s*{\s*background:\s*transparent;\s*border:\s*1px solid var\(--line\)/);
  });
});

describe("motion system", () => {
  // The motion block runs until the next area's block (later rounds append
  // their own blocks, with their own reduced-motion media queries).
  const motionStart = css.indexOf("/* === round 4: motion === */");
  const motionEnd = css.indexOf("/* === ", motionStart + 1);
  const motion = css.slice(motionStart, motionEnd < 0 ? undefined : motionEnd);

  it("moves the selection thumb with clip-path, never width or position", () => {
    expect(css).toMatch(/\.segmented\[style\*="--thumb-w"\]::before\s*{[^}]*clip-path:\s*inset\(var\(--thumb-y\) var\(--thumb-r\) var\(--thumb-b\) var\(--thumb-x\)/);
    expect(css).toMatch(/\.segmented\[style\*="--thumb-w"\]::before\s*{[^}]*transition:\s*var\(--thumb-motion,\s*clip-path var\(--dur-3\)/);
    expect(css).not.toMatch(/\.segmented::before\s*{[^}]*transition:[^}]*width/);
  });

  it("gives every overlay an exit keyed off data-state=closing", () => {
    for (const selector of ["\\.account-menu", "\\.admin-menu-list", "\\.admin-detail-drawer", "\\.action-notice"]) {
      expect(motion).toMatch(new RegExp(`${selector}\\[data-state="closing"\\]\\s*{[^}]*animation:\\s*motion-[a-z-]+ calc\\(var\\(--dur-[23]\\) \\* \\.7\\) var\\(--ease-in\\)`));
    }
    expect(motion).toMatch(/\[data-state="closing"\] > :is\(\.modal-panel, \.admin-reason-dialog\)\s*{[^}]*motion-scale-out/);
  });

  it("cross-fades page content on route changes, not the shell", () => {
    expect(motion).toMatch(/::view-transition-old\(root\)\s*{\s*display:\s*none/);
    expect(motion).toMatch(/::view-transition-new\(\.page-enter\)\s*{[^}]*motion-fade-up var\(--dur-3\)/);
  });

  it("switches all of it off for reduced motion", () => {
    const reduced = motion.slice(motion.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/::view-transition-new\(\*\)\s*{\s*animation:\s*none !important/);
    expect(reduced).toMatch(/\.skeleton-block, \.media-skeleton, \.quick-reel-skeleton\s*{\s*animation:\s*none/);
    expect(reduced).toMatch(/\.collapse, \.collapse\[data-state="closing"\]\s*{\s*transition:\s*none/);
  });
});
