# ProofRail implementation contract

## Target paths

- TSX: `src/components/marketing/proof-rail.tsx`
- CSS: `src/components/marketing/proof-rail.module.css`
- Test: `src/components/marketing/proof-rail.test.tsx`

## Original Linkar copy

The rail contains exactly these four verifiable facts, duplicated visually only for the continuous loop:

1. “Built on the official messaging API”
2. “Tokens encrypted at rest”
3. “Deterministic flow rules”
4. “Follow-ups respect the messaging window”

It contains no audience size, customer count, revenue result, endorsement, or logo claim.

## Semantic DOM hierarchy

```text
section#proof[aria-label="Linkar product facts"]
├─ h2 (visually hidden: “Linkar product facts”)
└─ div (overflow frame)
   ├─ ul (canonical facts)
   │  └─ li × 4
   └─ ul[aria-hidden="true"] (visual loop duplicate)
```

Assistive technology receives one list only. Without CSS animation, all four canonical facts remain readable.

## Exact layout

- Desktop `>= 1024px`: Canvas band, height `104px`; full viewport width; lists are one row with `64px` item gaps and `36px` separators; horizontal padding `32px`; each item remains on one line.
- Tablet `768px–1023px`: height `96px`; `48px` gaps; type size `0.78rem`; continuous loop remains when motion is permitted.
- Mobile `<= 767px`: minimum height `88px`; items use `32px` gaps and `20px` side padding; type size `0.72rem`; overflow stays clipped, but the canonical list may wrap into two rows under reduced motion.

## Visual values

- Canvas `#ffffff` background, Ink `#050505` text, `1px` Ink borders at `12%` on top and bottom.
- Separators are locally drawn `8px` Volt `#fff100` discs.
- Text uses `--font-mono`, weight `600`, uppercase, letter spacing `0.06em`.

## State transitions

The two lists translate left at constant linear speed over `28s` and loop without a blank gap. Pointer hover and keyboard focus within pause the animation. No content selection or click state exists.

## Assets

N/A. Separators are CSS geometry; the component has no image, icon package, or remote reference.

## Focus behavior

The rail has no interactive controls. If a future internal link is introduced, it must pause the rail on focus and use a `2px` Ink focus ring without changing the list semantics.

## Reduced motion

Disable all translation. Hide the visual duplicate and render the canonical facts as a centered wrapping list with `12px 24px` gaps and automatic height. All facts are visible without horizontal scrolling.

## Test contract

Assert one accessible list with four exact facts, a hidden visual duplicate, absence of links and unverifiable claims, pause-state hooks, and static canonical facts under reduced motion.

