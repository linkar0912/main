# SurfaceRunway implementation contract

## Target paths

- TSX: `src/components/marketing/surface-runway.tsx`
- CSS: `src/components/marketing/surface-runway.module.css`
- Test: `src/components/marketing/surface-runway.test.tsx`

## Original Linkar copy

- H2: “Meet people where the conversation starts.”
- Intro: “Choose the signal. Linkar gives every response a deliberate next step.”

| Card | Copy | Mini-preview |
|---|---|---|
| Comment triggers | “Turn a chosen word beneath a post into a relevant private reply.” | Comment → keyword rule → reply |
| DM triggers | “Recognize an incoming phrase and guide the conversation from the first message.” | Message → phrase rule → prompt |
| Story mentions | “Acknowledge a mention while the moment is still warm.” | Mention → thank-you → question |
| Follow-gated campaigns | “Check the condition before releasing the promised next step.” | Request → condition check → delivery |

## Semantic DOM hierarchy

```text
section#surfaces[aria-labelledby="surfaces-title"]
├─ header
│  ├─ h2#surfaces-title
│  └─ p
└─ div (runway viewport)
   └─ ul (track)
      └─ li × 4
         └─ article
            ├─ h3
            ├─ p
            └─ figure > local React/CSS mini-preview + figcaption
```

The cards are informational, not links or draggable widgets.

## Exact layout

- Desktop `>= 1024px`: section height `320vh`; header in the normal flow with padding `136px clamp(32px, 4.45vw, 72px) 64px`; runway viewport is sticky at `top: 88px`, height `calc(100vh - 88px)`, overflow hidden. Track is one row with `28px` gaps and side padding equal to page gutter. Each card is `min(38vw, 540px)` wide and `min(68vh, 640px)` tall. Vertical progress translates the track from `0` to exactly `-(scrollWidth - viewportWidth)`.
- Tablet `768px–1023px`: no sticky motion; `2 × 2` grid, `24px` gap, padding `112px 32px`; cards minimum height `520px`.
- Mobile `<= 767px`: one readable stacked list, `20px` gap, padding `88px 20px`; cards width `100%`, minimum height `460px`; preview occupies at least `220px`; no horizontal scrolling.

## Visual values

- Canvas `#ffffff` section; cards alternate Bone `#f7f6ef` and Canvas with `1px` Ink at `14%`.
- Ink `#050505` type; selected/action connector in Signal magenta `#fa0cf7`; small energy node in Volt `#fff100`.
- Card radius `32px`; padding `clamp(24px, 3vw, 40px)`.
- H2 uses the display maximum `clamp(4.5rem, 7vw, 7.5rem)`; H3 uses display `clamp(2rem, 3vw, 3.25rem)`; labels use `--font-mono`.

## State transitions

Desktop horizontal position is vertical-scroll-driven through a requestAnimationFrame-throttled controller and a `--runway-progress` custom property. Card previews reveal once through the shared intersection observer with `700ms cubic-bezier(.22,.61,.21,1)`. No card selection state exists. Tablet/mobile cards reveal in document order.

## Assets

N/A for image media. Each preview uses local React markup, CSS, and simple inline SVG connectors. Symbols are geometric and original; no copied interface, external URL, or imported brand asset is allowed.

## Focus behavior

N/A because there are no interactive controls. Text selection remains possible; wheel and touch scrolling always move the document rather than trapping input in the runway.

## Reduced motion

Disable sticky positioning and horizontal track transforms at every width. Render a responsive grid: four columns only when space permits, two columns on tablet, one on mobile. Reveal every card immediately and keep preview connectors static.

## Test contract

Assert four semantic articles with exact titles/copy, local preview labelling, no links or drag semantics, desktop progress clamping, document-flow fallback, cleanup of scroll work, and static grid under reduced motion.

