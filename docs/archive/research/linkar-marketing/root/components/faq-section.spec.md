# FaqSection implementation contract

## Target paths

- TSX: `src/components/marketing/faq-section.tsx`
- CSS: `src/components/marketing/faq-section.module.css`
- Test: `src/components/marketing/faq-section.test.tsx`

This is a client component because each answer is independently click/keyboard-driven. Server output includes all question text and answer content; the initial enhanced state has every answer collapsed.

## Original Linkar copy

- H2: “Good questions before you switch anything on.”

1. **“How does Linkar protect my account?”** “Linkar uses the connection you authorize, encrypts stored access tokens, verifies incoming requests, and keeps each workspace’s data scoped to that workspace.”
2. **“Does Linkar use the official API?”** “Yes. Linkar sends and receives supported messaging events through the platform’s official API and honors the active messaging window.”
3. **“Do I need to write code?”** “No. You choose triggers, conditions, replies, waits, and handoff steps in a visual flow. The underlying rules stay explicit and reviewable.”
4. **“What happens when a person should take over?”** “A handoff step pauses the automated path, keeps the conversation context together, and places it in a queue for your team.”

No answer promises immunity from platform review, delivery certainty, or unsupported behavior.

## Semantic DOM hierarchy

```text
section#faq[aria-labelledby="faq-title"]
└─ div (content frame)
   ├─ h2#faq-title
   └─ div (question list)
      └─ section × 4
         ├─ h3
         │  └─ button#faq-trigger-n[aria-expanded][aria-controls="faq-panel-n"]
         │     ├─ span (question)
         │     └─ span[aria-hidden="true"] (plus/minus glyph)
         └─ div#faq-panel-n[role="region"][aria-labelledby="faq-trigger-n"]
            └─ p
```

Multiple answers may be open. Native buttons supply Enter and Space operation.

## Exact layout

- Desktop `>= 1024px`: Ink section, padding `clamp(120px, 11vw, 176px) clamp(32px, 4.45vw, 72px)`; 12-column grid; H2 spans columns `1–5`, aligns start and remains sticky at `top: 144px`; question list spans columns `7–12`; rows minimum `112px`; answer max width `58ch` and bottom padding `36px`.
- Tablet `768px–1023px`: padding `112px 32px`; H2 above list, max width `800px`, margin-bottom `56px`, not sticky; rows minimum `104px`.
- Mobile `<= 767px`: padding `88px 20px`; H2 margin-bottom `44px`, size `clamp(2.75rem, 12vw, 4rem)`; trigger minimum height `88px`, gap `20px`; question size `1.2rem`; answer padding `0 40px 28px 0`.

## Visual values

- Ink `#050505` background, Canvas `#ffffff` primary text, Canvas borders at `22%`.
- Expanded question and glyph use Volt `#fff100`. Signal magenta `#fa0cf7` is not used in this section, preserving it for primary actions elsewhere.
- H2 uses display maximum and weight `850`; question uses display weight `700`; answer uses `--font-sans`; glyph uses local CSS lines.

## State transitions

Each row has independent boolean state. Click, Enter, or Space toggles it. `aria-expanded` and the answer visibility update in the same render. Visual expansion uses a grid-row transition and opacity over `320ms cubic-bezier(.43,.195,.02,1)`; plus rotates to minus within `260ms`. State is not synchronized to scroll or URL.

## Assets

N/A. Plus/minus is CSS geometry and all content is text. No image, external icon, or remote reference is used.

## Focus behavior

Triggers occupy the full row and have a visible `2px` Volt ring with `3px` offset. Toggling keeps focus on the trigger. Collapsing an answer never hides a focusable descendant because answers contain plain copy only.

## Reduced motion

Keep all click and keyboard behavior. Open and close answers immediately with no grid, height, opacity, or glyph-rotation animation. Expanded color and `aria-expanded` remain the state indicators.

## Test contract

Assert four exact questions and answers, button/region id relationships, all initially collapsed after enhancement, independent multi-open behavior, Enter/Space operation through native buttons, persistent trigger focus, visible expanded state, and immediate changes under reduced motion.
