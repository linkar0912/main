# SetupSteps implementation contract

## Target paths

- TSX: `src/components/marketing/setup-steps.tsx`
- CSS: `src/components/marketing/setup-steps.module.css`
- Test: `src/components/marketing/setup-steps.test.tsx`

## Original Linkar copy

- H2: “From first connection to live flow in three clear steps.”
- Intro: “Linkar keeps setup focused so you can spend your judgment on the conversation.”
- Step 01, “Connect your professional account”: “Authorize the messaging connection securely and confirm the account you want Linkar to use.”
- Step 02, “Choose a trigger”: “Pick the comment, message, mention, or campaign condition that should begin the flow.”
- Step 03, “Publish the flow”: “Review the path, switch it on, and watch each conversation move through visible states.”

Illustration status strings: “Connection protected”, “Trigger ready”, and “Flow live”.

## Semantic DOM hierarchy

```text
section#setup[aria-labelledby="setup-title"]
├─ header
│  ├─ h2#setup-title
│  └─ p
└─ ol
   └─ li × 3
      └─ article[aria-labelledby]
         ├─ p (step number)
         ├─ h3
         ├─ p (description)
         └─ figure
            ├─ local React/CSS illustration
            └─ figcaption (status)
```

An ordered list is required because sequence matters. Numbers are textual content, not CSS counters alone.

## Exact layout

- Desktop `>= 1024px`: Bone section, padding `clamp(120px, 11vw, 176px) clamp(32px, 4.45vw, 72px)`; header max width `1000px`; ordered list is three equal columns with `28px` gap and margin-top `72px`; cards minimum height `680px`; illustration sits in the lower `300px` of each card.
- Tablet `768px–1023px`: padding `112px 32px`; first two cards form two columns, third spans both columns with a horizontal copy/illustration layout; `24px` gap; card minimum height `560px`, spanning card `420px`.
- Mobile `<= 767px`: padding `88px 20px`; one-column list, `20px` gap; cards minimum height `520px`, padding `28px 24px`; illustration minimum height `220px`; H2 size `clamp(2.75rem, 12vw, 4rem)`.

## Visual values

- Bone `#f7f6ef` environment; Canvas `#ffffff` cards; Ink `#050505` type and illustration frames.
- Volt `#fff100` marks the step number and successful status; Signal magenta `#fa0cf7` marks the chosen trigger and publish action inside illustrations.
- Cards use `32px` radius, `1px` Ink at `12%`, and padding `clamp(24px, 3vw, 40px)`.
- H2 uses display maximum; step numbers/statuses use `--font-mono`; descriptions use `--font-sans`.

## State transitions

Cards use the shared intersection reveal once at threshold `0.18`, moving `48px → 0` and opacity `0 → 1` over `700ms cubic-bezier(.22,.61,.21,1)` with `80ms` increments. Illustration states enter in logical order within each card over `360–450ms`. These are presentational transitions; no step is selectable.

## Assets

N/A for image media. Connection shield, trigger paths, publish switch, cards, and connectors are original React/CSS/SVG geometry created in this component. No external URL or imported mark is allowed.

## Focus behavior

N/A because the steps are informational. If a future action is added, it must sit after the ordered list rather than making the entire card interactive.

## Reduced motion

Render all cards and illustrations at final opacity and position; remove stagger, connector drawing, and switch movement. Preserve the ordered sequence and all status text.

## Test contract

Assert the semantic ordered list, textual numbers `01–03`, exact step headings/copy/statuses, three local illustrations, no interactive controls, and immediate complete presentation under reduced motion.

