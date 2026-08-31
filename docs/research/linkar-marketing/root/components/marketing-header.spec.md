# MarketingHeader implementation contract

## Target paths

- TSX: `src/components/marketing/marketing-header.tsx`
- CSS: `src/components/marketing/marketing-header.module.css`
- Test: `src/components/marketing/marketing-header.test.tsx`

This is a focused client component because it owns scroll state and the mobile dialog.

## Linkar copy and destinations

- Brand accessible name: “Linkar home” → `/#top`
- Desktop anchors: “Product” → `/#product`; “How it works” → `/#how-it-works`; “Resources” → `/#resources`
- Primary action: “Get started” → `/signup`
- Account action: “Login” → `/login`
- Mobile dialog label: “Menu”; trigger labels: “Open menu” and “Close menu”

No navigation item implies a route or capability that does not exist.

## Semantic DOM hierarchy

```text
header[data-surface][data-visibility]
└─ div (content frame)
   ├─ a (Linkar home; mark + wordmark)
   ├─ nav[aria-label="Primary"]
   │  └─ ul > li > a × 5
   └─ div (mobile actions)
      ├─ a (Get started)
      ├─ button (menu opener)
      └─ dialog-like div[role="dialog"][aria-modal="true"] when open
         ├─ button (close)
         └─ nav[aria-label="Mobile primary"] > ul > li > a
```

## Exact layout

- Desktop `>= 1024px`: fixed at inset `0 0 auto`; height `88px`; horizontal padding `clamp(32px, 4.45vw, 72px)`; brand at left, navigation at right; navigation gap `28px`; CTA height `46px`, horizontal padding `22px`, radius `999px`; menu controls hidden.
- Tablet `768px–1023px`: fixed height `76px`; padding `0 32px`; desktop Product/How it works/Resources links hidden; brand, signup action, Login, and menu button remain; menu sheet uses the full viewport.
- Mobile `<= 767px`: fixed height `68px`; padding `0 20px`; wordmark, compact signup action, and `44px × 44px` menu button share one row; Login moves inside the sheet; sheet inset `0`, padding `20px`, menu links use `clamp(2.5rem, 12vw, 4.5rem)` display type.

The header z-index is `100`. The sheet z-index is `110` and covers the viewport with Ink.

## Visual values

- Hero state: transparent, foreground Canvas `#ffffff`.
- Solid state: Canvas `#ffffff` with Ink `#050505`, `1px` Ink at `12%` opacity, and a subtle blur only where supported.
- Primary action and active/focus accents: Signal magenta `#fa0cf7` with Ink text.
- Menu sheet: Ink with Canvas text and Volt `#fff100` focus rings.
- Navigation typography: `--font-mono`, `0.75rem`, weight `600`, letter spacing `0.02em`.

## State transitions

States are `hero | solid`, `visible | hidden`, and `menu closed | open`. Header surface and direction follow `BEHAVIORS.md`. Surface/color changes take `300ms`; vertical show/hide uses `420ms cubic-bezier(.43,.195,.02,1)`. Menu opacity and link entrances use `320ms`; closing always completes state cleanup.

While the menu is open, the header cannot hide, background scroll is locked, and link selection closes the sheet. Escape closes it. Resize across `768px` closes the mobile sheet and clears the lock.

## Assets

- Text wordmark only; no icon mark and no image asset.
- Menu glyph is authored with CSS lines or a local inline SVG with no imported mark.

## Focus behavior

All links and buttons use visible `2px` rings with `3px` offset. Opening moves focus to Close; Tab is trapped in the sheet; closing returns focus to Open menu. Focus within the header prevents scroll-driven hiding.

## Reduced motion

Keep threshold-driven surface changes, disable direction-based hiding, remove menu/link translations and CTA text rolling, and show the sheet immediately. Color changes may use `220ms` opacity only. All focus behavior remains unchanged.

## Test contract

Assert destinations, hero/solid threshold, downward hide and upward show, no hide while focused, labelled menu controls, Escape close, focus return, scroll-lock cleanup, link-selection close, and persistent visibility under reduced motion.

