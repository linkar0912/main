# FinalCta implementation contract

## Target paths

- TSX: `src/components/marketing/final-cta.tsx`
- CSS: `src/components/marketing/final-cta.module.css`
- Test: `src/components/marketing/final-cta.test.tsx`

The section is server-rendered and contains no client state.

## Original Linkar copy

- H2: “Give every promising conversation a next step.”
- Body: “Build your first Linkar flow, publish it with clear rules, and stay close to the moments that need you.”
- Primary action: “Create your flow” → `/signup`
- Secondary action: “See how it works” → `/#how-it-works`
- Visual detail labels: “Trigger ready”, “Reply shaped”, “Handoff clear”

## Semantic DOM hierarchy

```text
section#get-started[aria-labelledby="final-cta-title"]
└─ div (content grid)
   ├─ div (copy)
   │  ├─ h2#final-cta-title
   │  ├─ p
   │  └─ div (actions) > a × 2
   └─ figure[aria-label="A Linkar flow ready to publish"]
      ├─ local cropped React/CSS flow detail
      └─ figcaption
```

## Exact layout

- Desktop `>= 1024px`: Soft lilac section, minimum height `760px`; padding `clamp(112px, 10vw, 160px) clamp(32px, 4.45vw, 72px)`; 12-column grid; copy spans columns `1–7`; figure spans `8–12`, width `min(100%, 520px)`, rotates visually no more than `-3deg`, and is cropped by the section bottom; actions share one row with `16px` gap.
- Tablet `768px–1023px`: minimum height `720px`; padding `112px 32px 0`; copy spans all columns, max width `760px`; figure width `480px`, margin `56px 0 0 auto`, lower edge cropped.
- Mobile `<= 767px`: minimum height `700px`; padding `88px 20px 0`; copy and figure stack; H2 size `clamp(2.75rem, 12vw, 4rem)`; actions wrap with each action at least `52px` high; figure width `min(112%, 420px)`, margin `48px -6% 0 auto`, cropped only after all labels remain readable.

## Visual values

- Soft lilac `#eee4f4` environment, Ink `#050505` type.
- Primary action Signal magenta `#fa0cf7`, Ink label, `56px` height, `999px` radius, `26px` padding.
- Secondary action is transparent with `1px` Ink at `28%`.
- Figure frame is Ink with Canvas/Bone cards, Volt `#fff100` status nodes, radius `28px`.
- H2 uses display weight `850`, size `clamp(4.5rem, 7vw, 7.5rem)`, line-height `0.9`.

## State transitions

The shared intersection reveal brings copy from `translateY(56px)` and opacity `0` over `700ms cubic-bezier(.22,.61,.21,1)`. The figure enters `80ms` later from `translateY(48px) rotate(-1deg)` to its final crop/rotation. Action labels may use a `360ms` snap roll on hover/focus; label text remains present throughout.

## Assets

N/A for image media. The cropped flow detail is original React/CSS/SVG and uses only Linkar labels. It includes no external URL, copied frame, imported mark, or remote media.

## Focus behavior

Both actions use visible `2px` Ink rings with `3px` offset and at least `44px` target height. Keyboard focus does not trigger figure motion. Anchor focus lands below the fixed header.

## Reduced motion

Render copy and figure immediately at final opacity. Remove vertical entrance, rotation changes, parallax/crop movement, and label rolls. Keep static final crop and focus rings.

## Test contract

Assert exact heading/body/actions, `/signup` and internal anchor destinations, accessible figure name and three labels, no media URL, reveal hook, and complete static state under reduced motion.

