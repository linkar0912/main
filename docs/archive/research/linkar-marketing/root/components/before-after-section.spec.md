# BeforeAfterSection implementation contract

## Target paths

- TSX: `src/components/marketing/before-after-section.tsx`
- CSS: `src/components/marketing/before-after-section.module.css`
- Test: `src/components/marketing/before-after-section.test.tsx`

## Original Linkar copy

- H2: “Less inbox chasing. More conversations worth joining.”
- Manual panel title: “Without a system”
- Manual list: “Repeat the same answer”; “Lose context between replies”; “Remember every follow-up”; “Spot high intent too late”
- Linkar panel title: “With Linkar in the loop”
- Queue events: “Guide delivered”; “Goal captured: better leads”; “Follow-up scheduled”; “Context ready for a person”
- Closing line: “Automation handles the repeatable path. Your attention stays available for judgment.”

## Semantic DOM hierarchy

```text
section#outcomes[aria-labelledby="comparison-title"]
├─ header > h2#comparison-title
├─ div (comparison grid)
│  ├─ article[aria-labelledby="manual-title"]
│  │  ├─ h3#manual-title
│  │  └─ ul > li × 4
│  ├─ div[aria-hidden="true"] (divider)
│  └─ article[aria-labelledby="linkar-title"]
│     ├─ h3#linkar-title
│     └─ ol > li × 4
└─ p (closing line)
```

## Exact layout

- Desktop `>= 1024px`: padding `clamp(120px, 11vw, 176px) clamp(32px, 4.45vw, 72px)`; H2 max width `1100px`, margin-bottom `72px`; comparison is a `1fr 1px 1fr` grid with `64px` column gaps; panels minimum height `620px`; lists align vertically from `180px` below panel top.
- Tablet `768px–1023px`: padding `112px 32px`; comparison remains two equal columns with `32px` gap and a central line; panels minimum height `560px`; H2 margin-bottom `56px`.
- Mobile `<= 767px`: padding `88px 20px`; panels stack with the divider as a full-width horizontal line; each panel minimum height `420px`, padding `32px 24px`; gap `0`; H2 size `clamp(2.75rem, 12vw, 4rem)`.

## Visual values

- Manual panel: Bone `#f7f6ef`, Ink `#050505` type.
- Linkar panel: Ink, Canvas `#ffffff` type; current queue event uses Volt `#fff100`; closing emphasis uses Signal magenta `#fa0cf7` as a small rule.
- Panels use `32px` outer radius; list rows use `1px` currentColor borders at `18%`, `20px 0` padding.
- H2 uses display weight `850`; panel titles use display `clamp(2rem, 3vw, 3.25rem)`; queue metadata uses `--font-mono`.

## State transitions

The section reveals through the shared observer at threshold `0.18`. The divider scales from `0 → 1` over `650ms`; manual checklist rows reveal in `70ms` increments; queue events reveal in `90ms` increments, all with entrance easing `cubic-bezier(.22,.61,.21,1)`. The animation runs once. There is no user-selected state.

## Assets

N/A. Check indicators, queue nodes, and divider are CSS/local SVG geometry. No external media or marks are used.

## Focus behavior

N/A because this section is informational. Anchor targeting keeps its heading below the fixed header.

## Reduced motion

Divider, list rows, and queue events render immediately at final scale/opacity. Remove stagger and vertical travel. Preserve the two-surface comparison and ordered timeline.

## Test contract

Assert heading order, four manual items, four ordered queue events, original closing copy, correct `#outcomes` anchor, no interactive controls, reveal hooks, and complete static state under reduced motion.

