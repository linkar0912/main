# AutomationStory implementation contract

## Target paths

- TSX: `src/components/marketing/automation-story.tsx`
- CSS: `src/components/marketing/automation-story.module.css`
- Test: `src/components/marketing/automation-story.test.tsx`

This is a focused client component at desktop widths because it maps scroll progress to four product-scene states. It server-renders every chapter and scene in logical order.

## Original Linkar copy

- Section heading: “One spark. A conversation that knows what comes next.”
- Intro: “Linkar turns a simple trigger into a clear, useful sequence.”
- Chapter 01, “Open the right door”: “When the right comment arrives, Linkar sends a useful private reply in your voice.”
- Chapter 02, “Learn what matters”: “Ask one focused question, save the answer, and shape the next message around it.”
- Chapter 03, “Return on time”: “Schedule a thoughtful follow-up while the conversation is still open — no reminder list required.”
- Chapter 04, “Bring in a person”: “When intent becomes valuable or nuanced, pause the flow and place the full context in your queue.”

Scene strings are concise and original:

| Chapter | Scene data |
|---|---|
| 01 | Comment “GUIDE please”; condition “Keyword matched”; reply “The quick guide is ready. What would you like to improve first?” |
| 02 | Question “More replies or better leads?”; answer “Better leads”; memory “Goal saved” |
| 03 | Timeline “Now: guide sent”; “+ 18h: check in”; status “Within window” |
| 04 | Signal “Project details received”; action “Automation paused”; queue “Ready for you” |

## Semantic DOM hierarchy

```text
section#how-it-works[aria-labelledby="story-title"]
├─ header
│  ├─ h2#story-title
│  └─ p
└─ div (story grid)
   ├─ div (chapter copy rail)
   │  └─ article[aria-labelledby] × 4
   │     ├─ p (sequence number)
   │     ├─ h3
   │     └─ p
   └─ div (product stage; decorative state changes hidden from duplicate reading)
      └─ figure[aria-label="Four stages of a Linkar conversation"]
         ├─ ol (complete semantic stage summary)
         ├─ div[aria-hidden="true"] (visual control room)
         └─ figcaption
```

On tablet/mobile, each chapter receives its matching visible figure directly after its copy. Duplicate desktop visual layers are `aria-hidden`; the semantic ordered summary is available once.

## Exact layout

- Desktop `>= 1024px`: Volt section; header padding `clamp(112px, 10vw, 160px) clamp(32px, 4.45vw, 72px) 48px`; story body uses a 12-column grid. Copy rail spans columns `1–5`; each article has minimum height `100vh`, display grid, align-content center, and max width `520px`. Stage spans columns `7–12`, is sticky at `top: 88px`, height `calc(100vh - 88px)`, and centers a scene no larger than `680px × 720px`. Total story body owns `400vh`; active line is `45%` of the viewport.
- Tablet `768px–1023px`: document flow; padding `112px 32px`; header max width `820px`; each chapter is a two-column row with copy and scene, gap `40px`, padding `64px 0`, and `1px` Ink divider. No sticky stage. Scene minimum height `430px`.
- Mobile `<= 767px`: document flow; padding `88px 20px`; header margin-bottom `56px`; each chapter stacks copy then scene with `28px` gap and `72px` bottom padding; scene width `100%`, minimum height `380px`; H2 size `clamp(2.75rem, 12vw, 4rem)` and chapter H3 `2rem`.

## Visual values

- Environmental surface Volt `#fff100`; Ink `#050505` type and control-room frames; Canvas `#ffffff` message cards.
- Section H2 uses `--font-display`, weight `850`, size `clamp(4.5rem, 7vw, 7.5rem)`, line-height `0.9`.
- Numbers and scene status use `--font-mono`, weight `650`; body uses `--font-sans`.
- Main scene frame uses Ink, radius `32px`, padding `clamp(20px, 3vw, 44px)`; nested conversation cards use `20px` radius. Signal magenta `#fa0cf7` marks the current action only.

## State transitions

Desktop progress is scroll-driven through the shared throttled controller. Progress bands are `0–0.249`, `0.25–0.499`, `0.5–0.749`, and `0.75–1`; a chapter crossing the `45%` activation line becomes active. Copy opacity shifts `0.35 → 1` and moves `24px → 0`. The stage crossfades over `600ms`; message cards transform no more than `32px`; use `cubic-bezier(.43,.195,.02,1)`.

Scene states are exact:

1. Incoming comment connects to a generated private reply.
2. Reply transforms into a question, answer chip, and stored-goal field.
3. Stored goal shifts into a two-event follow-up timeline.
4. Timeline collapses into a paused flow and a contextual human queue card.

The component initializes at chapter 01. It does not expose tabs or click controls. Tablet and mobile expose all states in normal reading order.

## Assets

N/A for raster media. Phone, cards, connector lines, status dots, and small interface symbols are locally authored React/CSS/SVG geometry. They may not reproduce another interface or include an external mark.

## Focus behavior

There are no interactive controls inside the story. Each anchor target uses `scroll-margin-top: 6rem`. Product-stage changes never move keyboard focus or announce decorative intermediate motion.

## Reduced motion

At every width, switch to document flow with each scene after its chapter. Remove sticky positioning, crossfades, transforms, progress-controlled opacity, and connector drawing. All copy and scenes render fully opaque. Scroll tracking is not registered.

## Test contract

Assert all four headings, exact sequence numbers, copy and semantic scene states in server output; initial active index `0`; desktop index mapping at the four progress bands; tablet/mobile document order; no click-tab semantics; cleanup of frame/listeners; and complete flow presentation under reduced motion.

