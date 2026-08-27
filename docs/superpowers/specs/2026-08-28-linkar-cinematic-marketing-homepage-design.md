# Linkar cinematic marketing homepage redesign

**Date:** 2026-08-28  
**Status:** Approved direction; awaiting written-spec review  
**Scope:** Replace the failed marketing-page attempt with a polished public homepage at `/`, and move the authenticated dashboard to `/dashboard`.

## Purpose

Linkar needs a public homepage with the scale, pacing, and interaction quality of a category-leading automation product—not a generic SaaS card grid. The page should make Instagram automation feel immediate and visual: a creator sets a trigger once, Linkar handles the conversation, and the creator gets time back.

The finished page must be entirely Linkar. It may reproduce the approved reference page's macro composition and interaction patterns, but it must not ship third-party names, logos, copy, screenshots, downloaded media, hotlinked assets, or runtime network requests.

## Chosen approach

Build a structural-and-motion twin using original Linkar content and assets.

- Match the reference page's full-viewport hero, oversized typography, fixed navigation, bright scroll-story chapter, sticky product demonstrations, reveal pacing, dark FAQ, and substantial footer.
- Use a newly generated, original lifestyle hero image with no logos or recognizable third-party product UI.
- Build every product demonstration as semantic React and CSS so it remains responsive, accessible, and animatable.
- Keep the authenticated application visually and behaviorally intact outside the routing changes required to free `/` for the marketing page.

Rejected approaches:

1. A product-UI-only hero would be original but would miss the lifestyle scale and emotional contrast required by the brief.
2. Copying the reference DOM/CSS and replacing text would be brittle, difficult to maintain, and too likely to retain third-party identifiers or assets.

## Output plan

| Concern | Destination |
|---|---|
| Public homepage | `app/page.tsx` |
| Existing dashboard | `app/dashboard/page.tsx` |
| Marketing components | `src/components/marketing/` |
| Shared marketing behavior | `src/components/marketing/use-reveal.ts` and focused client components |
| Component styles | colocated `*.module.css` files |
| Original homepage assets | `public/marketing/` |
| Component specifications | `docs/research/linkar-marketing/root/components/` |
| Desktop/mobile references and QA captures | `docs/design-references/linkar-marketing/root/` |
| Behavior and topology research | `docs/research/linkar-marketing/root/` |

The failed worktree at `.claude/worktrees/public-marketing-homepage` is registered with Git and occupies approximately 1.3 GB. After this written spec is approved, remove that exact worktree using Git's worktree commands. Preserve its branch until the replacement passes verification, which keeps recovery possible without retaining the directory.

## Visual system

### Palette

The marketing page uses Linkar's existing Volt identity with stricter hierarchy:

| Name | Value | Use |
|---|---:|---|
| Ink | `#050505` | Footer, FAQ, primary type, dark product frames |
| Canvas | `#ffffff` | Editorial sections and navigation after scroll |
| Volt | `#fff100` | The long feature-story chapter and energy accents |
| Signal magenta | `#fa0cf7` | Primary CTA and active interaction states |
| Soft lilac | `#eee4f4` | Final pre-footer banner and secondary atmosphere |
| Bone | `#f7f6ef` | Quiet supporting surfaces and cards |

Volt is a large environmental color only in the central story chapter. Magenta remains the action color. Other sections stay restrained so those two moments retain impact.

### Typography

- **Display:** Bricolage Grotesque, 800–900 weight, tightly tracked, with desktop headings up to `clamp(4.5rem, 7vw, 7.5rem)` and mobile headings around `2.75rem`.
- **Body:** Manrope, 400–650 weight, optimized for short, direct product copy.
- **Utility:** JetBrains Mono for navigation labels, buttons, section metadata, step labels, and footer headings.

The display treatment should feel broad and physical, with deliberate line breaks. Small headings and repeated badge-like eyebrows are avoided unless they encode real structure.

### Layout signature

The page's signature is a yellow, multi-viewport automation story. Copy changes chapter-by-chapter while a sticky phone/control-room composition demonstrates the corresponding Linkar behavior.

```text
DESKTOP
┌──────────────────────────────────────────────────────────────┐
│ transparent fixed nav                           CTA / login  │
│                                                              │
│  large promise                    original lifestyle image   │
│  short proof + CTA                + live reply overlay       │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│                 oversized transition statement               │
└──────────────────────────────────────────────────────────────┘
┌─────────────────────── VOLT STORY ───────────────────────────┐
│ changing chapter copy          sticky animated product scene │
│ 01 comments                                                   │
│ 02 qualification                                              │
│ 03 timed follow-up                                            │
│ 04 handoff                                                    │
└──────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────┐
│ surfaces runway / before-after / workflow gallery / steps     │
├──────────────────────── BLACK FAQ ────────────────────────────┤
│ lilac CTA                                                     │
├──────────────────────── BLACK FOOTER ─────────────────────────┤
│ oversized LINKAR wordmark                                    │
└──────────────────────────────────────────────────────────────┘
```

On mobile, the story chapters become stacked panels with the demonstration immediately following each chapter's copy. Navigation condenses to the Linkar mark, CTA, and menu trigger. The page retains the same color rhythm and typographic scale without desktop-only pinned-scroll height.

## Page architecture

`app/page.tsx` remains a server component and assembles focused marketing components. Client JavaScript is limited to elements that genuinely require state or observation.

### 1. `MarketingHeader`

- Transparent and light-on-hero at the top of the page.
- Transitions to a solid light surface after leaving the hero.
- Desktop: brand, Product, How it works, Resources, Get started, Login.
- Mobile: brand, compact Get started CTA, menu button, full-screen menu sheet.
- Hides on downward scroll after the hero and returns on upward scroll.
- All internal marketing links use page anchors; application links point only to existing Linkar routes.

### 2. `HeroSection`

- Minimum height `100svh`; full-bleed original image.
- Linkar headline and concise outcome-oriented copy occupy the left third on desktop.
- Primary signup CTA uses signal magenta and the existing snap easing.
- A small React-built automation overlay shows a comment becoming a personalized reply without imitating another product's UI.
- Load sequence: background settles, headline lines rise, copy fades, CTA text rolls into place.

### 3. `ProofRail`

- A compact, horizontally moving trust rail using only verifiable Linkar facts: official API, encrypted tokens, deterministic flows, timed follow-ups.
- No customer counts, logos, testimonials, or revenue claims.
- Motion pauses on hover and is removed under reduced-motion preferences.

### 4. `ManifestoSection`

- Large centered statement that introduces the core promise: the best conversations should keep working after the creator logs off.
- Scroll reveal uses opacity and a 48–56 px vertical offset with the shared snap easing.

### 5. `AutomationStory`

Four real Linkar chapters:

1. Turn the right comment into a useful DM.
2. Ask one qualifying question and remember the answer.
3. Follow up on schedule without leaving the messaging window.
4. Hand a valuable conversation back to a person.

Desktop interaction model: scroll-driven. The story owns several viewports; copy chapters pass through an activation line while the sticky product demonstration crossfades and transforms between exact states. Mobile interaction model: normal document flow with one demonstration per chapter. No click tabs masquerading as scroll behavior.

### 6. `SurfaceRunway`

- Large cards for Comment triggers, DM triggers, Story mentions, and Follow-gated campaigns.
- Cards use original icons and React-built mini-previews.
- Desktop runway moves horizontally in response to vertical scroll; mobile uses a readable stacked list.

### 7. `BeforeAfterSection`

- A two-panel comparison: manual inbox chaos versus Linkar's controlled queue.
- Light panel lists repeated work and missed leads; ink panel demonstrates a calm, organized conversation timeline.
- The dividing line and checklist reveal as the section enters the viewport.

### 8. `WorkflowGallery`

- Left column is a selectable list of real use cases.
- Right column is an animated builder preview rendered in React.
- Interaction model is click-driven on desktop and accordion-driven on mobile.
- Selected content remains visible without animation when reduced motion is enabled.

### 9. `SetupSteps`

- Three actual steps: connect Instagram, choose a trigger, publish the flow.
- Each step includes an original product illustration and uses real sequence numbering because order matters.

### 10. `FaqSection`

- Black background, large heading, accessible accordion rows.
- Questions cover account safety, official API use, coding requirements, and what happens when a person needs to take over.
- Button semantics, `aria-expanded`, keyboard operation, and focus visibility are required.

### 11. `FinalCta`

- Soft-lilac field between FAQ and footer.
- Oversized Linkar-specific invitation, signup CTA, and an original cropped visual detail.

### 12. `MarketingFooter`

- Black footer with Product, Resources, Company, and Legal columns using existing Linkar pages only.
- Large Linkar wordmark occupies the final visual field.
- Copyright and truthful platform disclaimer remain legible and secondary.

## Motion system

- Shared easing: `cubic-bezier(.43,.195,.02,1)` for purposeful snaps and `cubic-bezier(.22,.61,.21,1)` for entrances.
- Reveal duration: 600–750 ms; interactive controls: 220–450 ms.
- `IntersectionObserver` activates ordinary reveal regions.
- A single requestAnimationFrame-throttled scroll controller handles header direction and automation-story progress.
- CSS custom properties communicate progress to transforms and opacity; components do not set layout styles on every frame.
- `prefers-reduced-motion: reduce` removes parallax, rollovers, marquees, and pinned transitions while retaining all content.
- No general-purpose animation dependency is added unless native CSS and the small controller prove insufficient during implementation.

## Data and component boundaries

Repeated content lives in typed arrays local to the owning component or in `marketing-content.ts` when shared by multiple components. Visual components receive stable, explicit props and do not fetch data.

The page is static. The only navigation side effects are links to signup, login, and existing public pages. No forms, analytics, cookies, or external scripts are added by this work.

## Routing changes

- `app/page.tsx` becomes public marketing content.
- The existing `DashboardScreen` moves unchanged to `app/dashboard/page.tsx`.
- Proxy matching moves the authenticated root gate from `/` to `/dashboard/:path*`.
- Post-login fallback, application home links, and relevant tests move from `/` to `/dashboard`.
- Every existing route remains present.

## Asset policy

- Generate one original hero image specifically for Linkar; keep the prompt and output inside project research/asset records.
- Product scenes, icons, and diagrams are authored locally as React/CSS/SVG.
- Do not download, bundle, trace, or hotlink any asset from the reference site.
- Do not copy its visible marketing copy, testimonials, customer identities, metadata, or links.
- Final verification scans rendered HTML, source files, stylesheets, URLs, and browser network requests for prohibited identifiers and external references.

## Error handling and resilience

- The hero image uses a stable local file with correct dimensions and responsive `sizes`; layout remains readable if image loading fails.
- Client interaction components initialize to useful server-rendered content.
- Observers and animation frames are disconnected during cleanup.
- Anchor navigation works without JavaScript.
- Mobile menu closes on route/anchor selection and Escape.
- FAQ and gallery states use semantic buttons and remain functional with motion disabled.

## Testing and verification

### Unit and integration

- Routing/auth fallback tests for `/dashboard`.
- Header destinations, mobile-menu state, Escape handling, and accessible labels.
- Automation-story chapter content and initial state.
- Workflow-gallery selection behavior.
- FAQ accordion semantics.
- Marketing-page structure, unique H1, CTA destinations, and absence of fabricated claims.

### Static checks

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm check:branding`
- `pnpm build`

### Browser QA

- Desktop at 1440 px, tablet at 768 px, and mobile at 390 px.
- Full-page screenshots plus section-level comparisons for hero, story, before/after, FAQ, and footer.
- Verify header show/hide, mobile menu, sticky story activation, workflow selection, FAQ, hover states, focus states, and reduced motion.
- Confirm no third-party identifiers, links, asset URLs, or external runtime requests are present in the finished marketing route.

## Acceptance criteria

1. `/` is a public, complete marketing page and `/dashboard` retains the authenticated dashboard.
2. The visual scale, section rhythm, color transitions, header behavior, scroll storytelling, FAQ treatment, and footer density meet the approved reference standard.
3. The page is composed from focused Next.js components rather than a monolithic page file.
4. All content and visual assets are original to Linkar.
5. Desktop, tablet, mobile, keyboard, and reduced-motion experiences are complete.
6. Existing authenticated routes and tests continue to work.
7. The full verification suite and visual QA pass before completion is reported.

