# ManifestoSection implementation contract

## Target paths

- TSX: `src/components/marketing/manifesto-section.tsx`
- CSS: `src/components/marketing/manifesto-section.module.css`
- Test: `src/components/marketing/manifesto-section.test.tsx`

## Original Linkar copy

- H2: “The best conversations should keep working after you log off.”
- Supporting line: “Linkar carries the useful next step forward, then makes room for you when judgment matters.”

## Semantic DOM hierarchy

```text
section#product[aria-labelledby="manifesto-title"][data-reveal]
└─ div (content frame)
   ├─ h2#manifesto-title
   └─ p
```

## Exact layout

- Desktop `>= 1024px`: Canvas section, minimum height `86svh` and `720px`; centered 12-column frame; H2 spans columns `2–12`, max width `1240px`, centered; supporting line max width `620px`; vertical padding `clamp(120px, 14vw, 220px)`.
- Tablet `768px–1023px`: minimum height `680px`; padding `120px 32px`; H2 max width `860px`; supporting line margin-top `36px`.
- Mobile `<= 767px`: minimum height `560px`; padding `96px 20px`; left-align copy; H2 size `clamp(2.75rem, 12vw, 4rem)`, line-height `0.96`; supporting line margin-top `28px`, max width `32ch`.

## Visual values

- Canvas `#ffffff` background and Ink `#050505` text.
- H2: `--font-display`, weight `850`, size `clamp(4.5rem, 7vw, 7.5rem)` desktop, tracking `-0.055em`, line-height `0.9`.
- Body: `--font-sans`, `clamp(1.05rem, 1.5vw, 1.35rem)`, line-height `1.5`, Ink at `72%`.
- One phrase, “keep working,” may carry a CSS-only Volt underline; it is not a badge or separate heading.

## State transitions

The section uses the shared intersection reveal with threshold `0.18`. H2 and body move from `translateY(56px)` and opacity `0` to rest/full opacity over `700ms cubic-bezier(.43,.195,.02,1)`, the shared snap easing, with the body delayed `80ms`. It reveals once and is then unobserved.

## Assets

N/A. The section is entirely text and CSS decoration.

## Focus behavior

N/A because there is no interactive control. Anchor focus/scroll targeting must place the heading below the fixed header via `scroll-margin-top: 6rem`.

## Reduced motion

Render H2 and body at rest and full opacity, with no delay or vertical offset. The optional underline remains static.

## Test contract

Assert heading hierarchy and exact copy, `#product` anchor, reveal data hook, no controls or external assets, and immediate visible state under reduced motion.
