# Task 6 report — ProofRail and ManifestoSection

## Commit

`42fb45e feat(marketing): add proof rail and manifesto`

## TDD evidence

- **RED:** `pnpm vitest run src/components/marketing/proof-rail.test.tsx src/components/marketing/manifesto-section.test.tsx` failed as expected because `./proof-rail` and `./manifesto-section` did not yet exist.
- **GREEN:** the same focused command passed with 2 files and 4 tests after the components were implemented.

## Delivered contract

- `ProofRail` is a static semantic `section#proof` with one accessible list containing exactly: “Built on the official messaging API”, “Tokens encrypted at rest”, “Deterministic flow rules”, and “Follow-ups respect the messaging window”. The visual duplicate is `aria-hidden` and there are no links, controls, customer claims, counts, testimonials, logos, or external assets.
- The rail uses the exact `28s linear` loop, 8px Volt separators, `#ffffff` Canvas, `#050505` Ink, and pauses on hover or focus-within. At `>=1024px` it is 104px high with 32px sides/64px gaps; at 768–1023px it is 96px with 48px gaps and `.78rem` type; at <=767px it has an 88px minimum with 20px sides/32px gaps and `.72rem` type.
- Under reduced motion, the rail animation is disabled, the duplicate is hidden, and the canonical facts become a centered wrapping list with 12px/24px gaps and automatic height.
- `ManifestoSection` uses the shared `Reveal` observer as `section#product`, preserving its `data-reveal` hook and threshold while applying the approved `700ms cubic-bezier(.43,.195,.02,1)` snap reveal. The heading/body use a 56px offset; the body has an 80ms delay; the section reveals once through the shared primitive.
- Manifesto layout is `max(86svh, 720px)` desktop, 680px tablet, and 560px mobile. It uses the approved desktop and mobile display scales, `#ffffff`/`#050505` palette, mobile left alignment, and `scroll-margin-top: 6rem`. Reduced motion restores heading and body immediately with no transition, delay, or offset.

## Verification

- Focused Vitest: 2 files, 4 tests passed.
- Full Vitest: 99 files, 586 tests passed.
- `pnpm typecheck`, `pnpm lint`, and `pnpm check:branding` passed.
- `git diff --cached --check` passed before commit.
- A task-file originality scan found no external URLs, prohibited third-party identifiers, fabricated metrics, or prohibited marketing claims. The repository-wide `check:marketing-origin` command is planned for a later task and was not yet present.

## Self-review and concerns

- The implementation is server-rendered except for the existing shared `Reveal` client boundary; no new dependencies or client boundary were introduced.
- CSS includes explicit desktop/tablet/mobile and `prefers-reduced-motion` rules, reviewed against the 1440/768/390 contract values. The sections are not yet assembled into `app/page.tsx`, so browser screenshots belong to the later integration task.

## Reduced-motion hardening fix

### Commit

`fix(marketing): harden reduced-motion editorial sections`

### TDD and verification evidence

- **RED:** Added focused assertions for ProofRail pause/reduced-motion hooks and ManifestoSection's reduced-motion-visible state; the focused Vitest run failed 2 tests because those hooks were absent.
- **GREEN:** Added the declarative hooks and corrected the reduced-motion rail frame to keep `overflow: hidden`; the focused Vitest run passed 2 files and 5 tests.
- Full Vitest after the fix: 99 files, 587 tests passed.
- Added a focused Playwright probe that checks hover/focus pause state and computed reduced-motion styles (clipped frame, wrapped canonical list, hidden duplicate, static manifesto). With the old `overflow: visible` rule restored temporarily, the probe failed with `Received: visible`; with the fix restored, it passed.
- Final checks passed: `pnpm typecheck`, `pnpm lint`, `pnpm check:branding`, and `git diff --check`.
- The repository's planned `check:marketing-origin` script is not present yet; a focused added-lines scan found no prohibited external URLs or third-party identifiers.
- JSDOM does not evaluate `prefers-reduced-motion`, so media-query behavior is verified by the real-browser probe rather than inferred from source text.

### Scope

- `ProofRail` now exposes pause and canonical wrapping hooks for meaningful DOM assertions; the duplicate remains `aria-hidden` and the media-query CSS keeps the frame clipped.
- `ManifestoSection` exposes its immediate-visible reduced-motion state while the existing CSS removes reveal opacity, transform, and delay under reduced motion.
