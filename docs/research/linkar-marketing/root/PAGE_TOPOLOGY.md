# Linkar marketing page topology

## Purpose

This contract fixes the public homepage order and the boundary of every section before implementation. `app/page.tsx` remains a server component, owns the single `<main>`, and composes the section components without fetching data. Stateful behavior stays inside the smallest client component that needs it.

## Canonical order

The exact page order is:

**fixed header → full-height hero → proof rail → manifesto → four-chapter Volt story → surface runway → before/after → workflow gallery → setup steps → black FAQ → lilac CTA → black footer.**

| Order | Landmark / component | Required id | Surface | Primary job |
|---:|---|---|---|---|
| 0 | `MarketingHeader` | N/A | Transparent over hero, then Canvas | Persistent navigation outside `<main>` |
| 1 | `HeroSection` | `top` | Full-bleed local image with Ink overlay | State the product outcome and primary action |
| 2 | `ProofRail` | `proof` | Canvas | Present four verifiable product facts |
| 3 | `ManifestoSection` | `product` | Canvas | Bridge the promise into the product story |
| 4 | `AutomationStory` | `how-it-works` | Volt | Explain four sequential automation behaviors |
| 5 | `SurfaceRunway` | `surfaces` | Canvas | Show the four supported trigger surfaces |
| 6 | `BeforeAfterSection` | `outcomes` | Bone / Ink split | Contrast repetitive work with a controlled queue |
| 7 | `WorkflowGallery` | `workflows` | Canvas | Let visitors inspect real Linkar use cases |
| 8 | `SetupSteps` | `setup` | Bone | Explain the three-step launch sequence |
| 9 | `FaqSection` | `faq` | Ink | Answer safety and product-operation questions |
| 10 | `FinalCta` | `get-started` | Soft lilac | Present the final signup invitation |
| 11 | `MarketingFooter` | `resources` | Ink | Resolve internal navigation and product context |

## Composition contract

```tsx
<>
  <MarketingHeader />
  <main id="main-content">
    <HeroSection />
    <ProofRail />
    <ManifestoSection />
    <AutomationStory />
    <SurfaceRunway />
    <BeforeAfterSection />
    <WorkflowGallery />
    <SetupSteps />
    <FaqSection />
    <FinalCta />
  </main>
  <MarketingFooter />
</>
```

- The page has exactly one `<h1>`, owned by `HeroSection`.
- Each later major region starts with one `<h2>` and is labelled by that heading.
- `MarketingHeader` and `MarketingFooter` are outside `<main>`.
- No component performs a network request. Repeated content is a typed local array, promoted to `src/components/marketing/marketing-content.ts` only when two or more components consume it.
- Anchor navigation works before client JavaScript initializes. The fixed-header offset is provided with `scroll-margin-top: 6rem` on section anchors.
- Signup and login actions use `/signup` and `/login`. Authenticated product entry uses `/dashboard`. Policy and help links use only routes already present in this repository.

## Shared responsive frame

| Viewport | Contract |
|---|---|
| Desktop, `>= 1024px` | Maximum content width `1440px`; page gutters `clamp(32px, 4.45vw, 72px)`; 12-column grid; major vertical spacing `clamp(96px, 10vw, 160px)` |
| Tablet, `768px–1023px` | Gutters `32px`; 8-column grid; major vertical spacing `96px`; sticky sections may remain sticky only where their component contract permits |
| Mobile, `<= 767px` | Gutters `20px`; 4-column grid; major vertical spacing `72px`; no page section depends on pinned scroll to expose content |

The display scale tops out at `clamp(4.5rem, 7vw, 7.5rem)` on desktop and resolves to about `2.75rem` on mobile. Body text uses `--font-sans`; display text uses `--font-display`; navigation, controls, metadata, step numbers, and footer headings use `--font-mono`.

## Color rhythm

The transition sequence is deliberately sparse:

1. Hero image and Ink overlay.
2. Canvas for proof and manifesto.
3. Volt `#fff100` for the long, four-chapter story.
4. Canvas, then Bone `#f7f6ef`, then Canvas, then Bone for the explanatory middle.
5. Ink `#050505` for FAQ.
6. Soft lilac `#eee4f4` for the closing action.
7. Ink for the footer.

Signal magenta `#fa0cf7` is reserved for primary actions and selected states. It does not become a large environmental background.

## Shared asset boundary

- All raster files live below `public/marketing/` and are created specifically for Linkar.
- All product scenes, controls, diagrams, and icons are authored locally as semantic React, CSS, or simple SVG geometry.
- No external URL, remote request, embedded third-party mark, copied interface, or non-Linkar media is permitted.
- Image failure must leave useful text, contrast, and layout intact.

## Page-level acceptance checks

- Rendered section order matches the canonical order without extra promotional bands.
- The route has one unique H1 and every section is reachable with headings and landmarks.
- All public navigation destinations are internal and existing.
- Server-rendered content is complete before observers or controllers initialize.
- At `1440px`, `768px`, and `390px`, no section clips horizontally and the final footer immediately follows the lilac CTA.

