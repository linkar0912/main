# Linkar Cinematic Marketing Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public, cinematic Linkar homepage at `/` with original assets, large-scale responsive design, scroll-led product storytelling, and a complete header/footer while moving the existing authenticated dashboard to `/dashboard`.

**Architecture:** Keep `app/page.tsx` as a server-rendered assembly of focused marketing components. Use small client islands only for header scroll state, reveal observation, the sticky story, the workflow selector, and FAQ/menu state; keep styles colocated in CSS Modules and retain shared brand tokens in `app/globals.css`.

**Tech Stack:** Next.js 16.3 App Router, React 19.2, TypeScript 5.9 strict mode, CSS Modules, `next/image`, Lucide React, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-28-linkar-cinematic-marketing-homepage-design.md`

## Global Constraints

- Read these installed Next.js guides before implementation: `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `11-css.md`, `12-images.md`, and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`.
- Do not ship third-party names, logos, copy, screenshots, downloaded media, hotlinked assets, or runtime requests on `/`.
- Keep every product demonstration semantic React/CSS/SVG, not a screenshot.
- Keep the existing authenticated application unchanged except for moving its home route to `/dashboard`.
- Support 1440 px, 768 px, 390 px, keyboard navigation, and `prefers-reduced-motion`.
- Do not add a general-purpose animation library unless native CSS and the focused scroll controller fail a documented requirement.
- Every component builder owns only the files listed for its task and must not revert another worker's changes.
- Run the component's focused test and `pnpm typecheck` before completing each task.
- Run `pnpm lint`, `pnpm test`, `pnpm check:branding`, `pnpm build`, and targeted Playwright QA before completion.

## File map

| File or directory | Responsibility |
|---|---|
| `app/page.tsx` | Public server-rendered page assembly |
| `app/dashboard/page.tsx` | Existing authenticated dashboard |
| `src/components/marketing/marketing-content.ts` | Typed, original Linkar homepage copy/data |
| `src/components/marketing/reveal.tsx` | Reusable intersection-observer reveal wrapper |
| `src/components/marketing/button-roll.tsx` | Reusable rolling CTA label |
| `src/components/marketing/marketing-header.tsx` | Fixed desktop/mobile marketing navigation |
| `src/components/marketing/hero-section.tsx` | Full-viewport hero and automation overlay |
| `src/components/marketing/proof-rail.tsx` | Verifiable Linkar capability ticker |
| `src/components/marketing/manifesto-section.tsx` | Oversized editorial transition |
| `src/components/marketing/automation-story.tsx` | Scroll-driven four-chapter Volt story |
| `src/components/marketing/surface-runway.tsx` | Instagram automation-surface showcase |
| `src/components/marketing/before-after-section.tsx` | Manual-versus-Linkar comparison |
| `src/components/marketing/workflow-gallery.tsx` | Click/accordion workflow demonstrations |
| `src/components/marketing/setup-steps.tsx` | Three-step activation sequence |
| `src/components/marketing/faq-section.tsx` | Accessible dark accordion |
| `src/components/marketing/final-cta.tsx` | Lilac conversion banner |
| `src/components/marketing/marketing-footer.tsx` | Complete black footer and wordmark |
| `src/components/marketing/*.module.css` | Component-scoped layout and motion |
| `public/marketing/linkar-hero.webp` | Original generated hero photograph |
| `scripts/check-marketing-origin.mjs` | Prohibited identifier/hotlink scanner |
| `docs/research/linkar-marketing/root/` | Behavior, topology, and component contracts |
| `docs/design-references/linkar-marketing/root/` | Linkar-only desktop/mobile QA captures |

---

### Task 1: Remove the failed worktree and lock the implementation contracts

**Files:**
- Remove directory: `.claude/worktrees/public-marketing-homepage`
- Create: `docs/research/linkar-marketing/root/PAGE_TOPOLOGY.md`
- Create: `docs/research/linkar-marketing/root/BEHAVIORS.md`
- Create: `docs/research/linkar-marketing/root/components/{marketing-header,hero-section,proof-rail,manifesto-section,automation-story,surface-runway,before-after-section,workflow-gallery,setup-steps,faq-section,final-cta,marketing-footer}.spec.md`

**Interfaces:**
- Consumes: approved design spec.
- Produces: one implementation contract per component before any builder is dispatched.

- [ ] **Step 1: Verify the exact stale worktree and preserve its branch**

Run:

```bash
git worktree list --porcelain
git branch --list worktree-public-marketing-homepage
```

Expected: the directory is registered and branch `worktree-public-marketing-homepage` exists.

- [ ] **Step 2: Remove only the failed worktree directory**

Run:

```bash
git worktree unlock .claude/worktrees/public-marketing-homepage
git worktree remove --force .claude/worktrees/public-marketing-homepage
git worktree prune
```

Expected: `test ! -d .claude/worktrees/public-marketing-homepage` succeeds; the branch still exists for recovery.

- [ ] **Step 3: Write the topology and behavior contracts**

Record this exact page order in `PAGE_TOPOLOGY.md`: fixed header → full-height hero → proof rail → manifesto → four-chapter Volt story → surface runway → before/after → workflow gallery → setup steps → black FAQ → lilac CTA → black footer.

Record these exact interaction models in `BEHAVIORS.md`: header direction/hero threshold is scroll-driven; reveal regions are intersection-driven; the Volt story is scroll-driven on desktop and document-flow on mobile; gallery is click-driven desktop/accordion mobile; FAQ and mobile menu are click/keyboard-driven; reduced motion disables all nonessential transforms.

- [ ] **Step 4: Write all twelve component specs**

Each spec must contain: target TSX/CSS/test paths, semantic DOM hierarchy, exact desktop/tablet/mobile layout, values from the design spec, state transitions, original Linkar copy, assets, focus behavior, and reduced-motion behavior. Mark only genuinely inapplicable sections as `N/A`.

- [ ] **Step 5: Verify and commit contracts**

Run:

```bash
test ! -d .claude/worktrees/public-marketing-homepage
test "$(find docs/research/linkar-marketing/root/components -name '*.spec.md' | wc -l | tr -d ' ')" = "12"
! rg -n 'TB[D]|TO[D]O|FIXM[E]' docs/research/linkar-marketing/root
```

Expected: directory absent, 12 specs, and the final command has no matches.

```bash
git add docs/research/linkar-marketing/root
git commit -m "docs(marketing): record cinematic homepage component contracts"
```

---

### Task 2: Move the dashboard to `/dashboard` and make `/` public

**Files:**
- Modify: `proxy.ts`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/session.test.ts`
- Modify: `app/api/auth/login/route.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `src/components/dashboard-screen.test.tsx`
- Modify: `src/components/public-page.tsx`
- Create: `src/components/public-page.test.tsx`
- Create: `app/dashboard/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `DashboardScreen`, `safeNextPath(value)`.
- Produces: public `/`, gated `/dashboard`, and `/dashboard` as the safe post-login fallback.

- [ ] **Step 1: Write failing routing tests**

Add assertions:

```tsx
expect(safeNextPath("https://evil.example")).toBe("/dashboard");
expect(safeNextPath("//evil.example")).toBe("/dashboard");
expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
expect(screen.getByRole("link", { name: "Linkar" })).toHaveAttribute("href", "/dashboard");
```

Create `public-page.test.tsx` asserting the `Back to app` link targets `/dashboard`.

- [ ] **Step 2: Verify tests fail**

Run:

```bash
pnpm vitest run src/lib/auth/session.test.ts src/components/app-shell.test.tsx src/components/public-page.test.tsx
```

Expected: failures still report `/`.

- [ ] **Step 3: Implement the route move**

Use:

```tsx
// app/dashboard/page.tsx
import { DashboardScreen } from "@/src/components/dashboard-screen";

export default function DashboardPage() {
  return <DashboardScreen />;
}
```

Change the proxy matcher root entry to `"/dashboard/:path*"`, `safeNextPath` and login fallback to `"/dashboard"`, AppShell home links to `/dashboard`, and test pathname mocks to `/dashboard`. Replace `app/page.tsx` temporarily with a public semantic placeholder linked to `/signup`; Task 13 replaces it with final assembly.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run src/lib/auth/session.test.ts src/components/app-shell.test.tsx src/components/public-page.test.tsx src/components/dashboard-screen.test.tsx
pnpm typecheck
git add proxy.ts src/lib/auth/session.ts src/lib/auth/session.test.ts app/api/auth/login/route.ts src/components/app-shell.tsx src/components/app-shell.test.tsx src/components/dashboard-screen.test.tsx src/components/public-page.tsx src/components/public-page.test.tsx app/dashboard/page.tsx app/page.tsx
git commit -m "feat(routing): make marketing home public"
```

---

### Task 3: Add the original hero asset and shared marketing primitives

**Files:**
- Create: `public/marketing/linkar-hero.webp`
- Create: `docs/research/linkar-marketing/root/HERO_ASSET.md`
- Create: `src/components/marketing/marketing-content.ts`
- Create: `src/components/marketing/reveal.tsx`
- Create: `src/components/marketing/reveal.test.tsx`
- Create: `src/components/marketing/button-roll.tsx`
- Create: `src/components/marketing/button-roll.test.tsx`
- Create: `src/components/marketing/primitives.module.css`

**Interfaces:**
- Produces: `Reveal({ children, className?, delay? })`, `ButtonRoll({ label })`, `storyChapters`, `surfaceCards`, `workflowItems`, `faqItems`.

- [ ] **Step 1: Generate and validate the hero image**

Generate one original 16:10 editorial photograph: a creator relaxing in a modern studio while a phone and laptop sit nearby, subtle Volt-yellow and magenta wardrobe accents, generous dark negative space on the left for white headline copy, no text, no logos, no identifiable product UI. Save locally as WebP at a minimum of 1920×1200. Record the prompt, dimensions, and local path in `HERO_ASSET.md`.

- [ ] **Step 2: Write failing primitive tests**

```tsx
render(<ButtonRoll label="Get started" />);
expect(screen.getAllByText("Get started")).toHaveLength(2);

render(<Reveal><p>Ready</p></Reveal>);
expect(screen.getByText("Ready").closest("[data-reveal]")).toBeTruthy();
```

- [ ] **Step 3: Implement primitives and typed content**

Define:

```ts
export type StoryChapter = { id: string; eyebrow: string; title: string; body: string; scene: "comment" | "qualify" | "followup" | "handoff" };
export type WorkflowItem = { id: string; label: string; title: string; body: string; event: string; reply: string };
export type FaqItem = { id: string; question: string; answer: string };
```

`Reveal` uses one `IntersectionObserver` with threshold `0.18`, sets `data-visible`, and disconnects on cleanup. `ButtonRoll` renders two `aria-hidden` copies inside one accessible label. Content must describe only real Linkar features from the approved spec.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run src/components/marketing/reveal.test.tsx src/components/marketing/button-roll.test.tsx
pnpm typecheck
git add public/marketing docs/research/linkar-marketing/root/HERO_ASSET.md src/components/marketing
git commit -m "feat(marketing): add original hero asset and motion primitives"
```

---

### Task 4: Build `MarketingHeader`

**Files:**
- Create: `src/components/marketing/marketing-header.tsx`
- Create: `src/components/marketing/marketing-header.test.tsx`
- Create: `src/components/marketing/marketing-header.module.css`

**Interfaces:**
- Produces: `MarketingHeader()` client component.

- [ ] **Step 1: Write failing tests**

Assert brand `/`, Product `#product`, How it works `#how-it-works`, Resources `#faq`, signup `/signup`, login `/login`, mobile menu `aria-expanded`, Escape close, and focus restoration.

- [ ] **Step 2: Verify failure**

```bash
pnpm vitest run src/components/marketing/marketing-header.test.tsx
```

- [ ] **Step 3: Implement the exact state model**

Use `scrolled`, `hidden`, and `menuOpen`. One requestAnimationFrame-throttled passive scroll handler sets `scrolled` after 70% of the viewport and hides only when moving downward by more than 8 px below the hero. Escape closes the dialog; body overflow is restored during cleanup. Render a semantic `<header>`, desktop `<nav>`, and mobile `role="dialog"` menu.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run src/components/marketing/marketing-header.test.tsx
pnpm typecheck
git add src/components/marketing/marketing-header.*
git commit -m "feat(marketing): add responsive cinematic header"
```

---

### Task 5: Build `HeroSection`

**Files:**
- Create: `src/components/marketing/hero-section.tsx`
- Create: `src/components/marketing/hero-section.test.tsx`
- Create: `src/components/marketing/hero-section.module.css`

**Interfaces:**
- Consumes: `ButtonRoll`, `public/marketing/linkar-hero.webp`.
- Produces: `HeroSection()` with the page's only `<h1>`.

- [ ] **Step 1: Write failing tests**

Assert H1 `Instagram automation, made clear.`, local image source, signup CTA, `#product` secondary link, and semantic automation overlay text `Comment: price` → `Sent the price list`.

- [ ] **Step 2: Implement**

Use `next/image` with `fill`, `priority`, and `sizes="100vw"`. Hero is `min-height:100svh`; desktop copy width is `min(42rem,48vw)` and mobile copy sits above the focal image. Apply a dark left-to-right overlay and a bottom mobile gradient. Load motion uses line wrappers and CSS keyframes; reduced motion renders the final state.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run src/components/marketing/hero-section.test.tsx
pnpm typecheck
git add src/components/marketing/hero-section.*
git commit -m "feat(marketing): build full-bleed Linkar hero"
```

---

### Task 6: Build `ProofRail` and `ManifestoSection`

**Files:**
- Create: `src/components/marketing/proof-rail.tsx`
- Create: `src/components/marketing/proof-rail.test.tsx`
- Create: `src/components/marketing/proof-rail.module.css`
- Create: `src/components/marketing/manifesto-section.tsx`
- Create: `src/components/marketing/manifesto-section.test.tsx`
- Create: `src/components/marketing/manifesto-section.module.css`

**Interfaces:**
- Consumes: `Reveal`.
- Produces: `ProofRail()`, `ManifestoSection()`.

- [ ] **Step 1: Write failing tests**

Assert the four truthful proof items and manifesto heading `Your best conversations should keep working after you log off.`; assert no customer names, counts, or testimonial markup.

- [ ] **Step 2: Implement**

Proof rail duplicates its item list only for visual continuity and marks the duplicate `aria-hidden`. CSS animation is linear, pauses on hover, and is disabled for reduced motion. Manifesto uses a centered max-width and `clamp(3rem,7vw,7.5rem)`.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run src/components/marketing/proof-rail.test.tsx src/components/marketing/manifesto-section.test.tsx
pnpm typecheck
git add src/components/marketing/proof-rail.* src/components/marketing/manifesto-section.*
git commit -m "feat(marketing): add proof rail and manifesto"
```

---

### Task 7: Build the scroll-driven `AutomationStory`

**Files:**
- Create: `src/components/marketing/automation-story.tsx`
- Create: `src/components/marketing/automation-story.test.tsx`
- Create: `src/components/marketing/automation-story.module.css`

**Interfaces:**
- Consumes: `StoryChapter[]`.
- Produces: `AutomationStory()` client component and `data-active-scene` state.

- [ ] **Step 1: Write failing tests**

Assert four chapters in order, one active initial scene `comment`, and meaningful preview labels for comment, qualification, scheduled follow-up, and handoff.

- [ ] **Step 2: Implement desktop and mobile models**

Desktop uses a two-column section with chapter copy blocks each `min-height:95vh` and a preview column `position:sticky; top:12vh; height:76vh`. An observer rooted at `-42% 0px -42%` sets the active chapter. Render all four scenes in one stable preview frame and crossfade using `data-active-scene`. Below 768 px, remove sticky positioning and render each scene directly after its chapter.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run src/components/marketing/automation-story.test.tsx
pnpm typecheck
git add src/components/marketing/automation-story.*
git commit -m "feat(marketing): add scroll-led automation story"
```

---

### Task 8: Build `SurfaceRunway` and `BeforeAfterSection`

**Files:**
- Create: `src/components/marketing/surface-runway.tsx`
- Create: `src/components/marketing/surface-runway.test.tsx`
- Create: `src/components/marketing/surface-runway.module.css`
- Create: `src/components/marketing/before-after-section.tsx`
- Create: `src/components/marketing/before-after-section.test.tsx`
- Create: `src/components/marketing/before-after-section.module.css`

**Interfaces:**
- Consumes: `surfaceCards`, `Reveal`.
- Produces: `SurfaceRunway()`, `BeforeAfterSection()`.

- [ ] **Step 1: Write failing tests**

Assert four surface cards and both comparison labels `Before Linkar` and `With Linkar`; assert the dark panel includes `Qualified lead ready for you`.

- [ ] **Step 2: Implement**

Make `SurfaceRunway` a client component. Measure its section with one passive scroll listener scheduled through `requestAnimationFrame`; compute `progress = clamp((viewportHeight - rect.top) / (viewportHeight + rect.height), 0, 1)` and write it to the section as `--runway-progress`. Desktop CSS translates the wide card grid from `translateX(8vw)` to `translateX(-18vw)` using that variable. Below 768 px, remove the transform and use a normal stacked grid. When reduced motion is requested, skip the listener and keep the grid centered. Before/after uses equal desktop panels, a curved dark panel edge, and stacked full-width mobile panels. All previews are local React/SVG.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run src/components/marketing/surface-runway.test.tsx src/components/marketing/before-after-section.test.tsx
pnpm typecheck
git add src/components/marketing/surface-runway.* src/components/marketing/before-after-section.*
git commit -m "feat(marketing): add surfaces and before-after story"
```

---

### Task 9: Build `WorkflowGallery`

**Files:**
- Create: `src/components/marketing/workflow-gallery.tsx`
- Create: `src/components/marketing/workflow-gallery.test.tsx`
- Create: `src/components/marketing/workflow-gallery.module.css`

**Interfaces:**
- Consumes: `WorkflowItem[]`.
- Produces: `WorkflowGallery()` client component.

- [ ] **Step 1: Write failing interaction tests**

Render the gallery, click `Send a price list`, assert the corresponding event/reply appear and the button has `aria-selected="true"`; click another item and assert the preview changes. On mobile semantics, buttons expose `aria-expanded`.

- [ ] **Step 2: Implement**

Use one `activeId` initialized from `workflowItems[0].id`. Desktop is `role="tablist"` + `role="tabpanel"`; mobile styles the same semantic buttons as accordions while keeping only active details visible. The preview contains trigger, condition, and reply nodes connected with SVG paths.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run src/components/marketing/workflow-gallery.test.tsx
pnpm typecheck
git add src/components/marketing/workflow-gallery.*
git commit -m "feat(marketing): add interactive workflow gallery"
```

---

### Task 10: Build `SetupSteps` and `FaqSection`

**Files:**
- Create: `src/components/marketing/setup-steps.tsx`
- Create: `src/components/marketing/setup-steps.test.tsx`
- Create: `src/components/marketing/setup-steps.module.css`
- Create: `src/components/marketing/faq-section.tsx`
- Create: `src/components/marketing/faq-section.test.tsx`
- Create: `src/components/marketing/faq-section.module.css`

**Interfaces:**
- Consumes: `faqItems`, `Reveal`.
- Produces: `SetupSteps()`, `FaqSection()` client component.

- [ ] **Step 1: Write failing tests**

Assert the three numbered steps and their order. For FAQ, assert all question buttons start collapsed, click the account-safety question, verify `aria-expanded="true"` and answer visibility, then click again to collapse.

- [ ] **Step 2: Implement**

Steps use ordered-list semantics and original CSS/SVG illustrations. FAQ keeps one `openId: string | null`, renders buttons with `aria-controls`, panels with matching IDs, and a rotating plus icon. The black section uses white text and magenta focus rings.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run src/components/marketing/setup-steps.test.tsx src/components/marketing/faq-section.test.tsx
pnpm typecheck
git add src/components/marketing/setup-steps.* src/components/marketing/faq-section.*
git commit -m "feat(marketing): add setup steps and accessible FAQ"
```

---

### Task 11: Build `FinalCta` and `MarketingFooter`

**Files:**
- Create: `src/components/marketing/final-cta.tsx`
- Create: `src/components/marketing/final-cta.test.tsx`
- Create: `src/components/marketing/final-cta.module.css`
- Create: `src/components/marketing/marketing-footer.tsx`
- Create: `src/components/marketing/marketing-footer.test.tsx`
- Create: `src/components/marketing/marketing-footer.module.css`

**Interfaces:**
- Consumes: `LinkarMark`, `ButtonRoll`.
- Produces: `FinalCta()`, `MarketingFooter()`.

- [ ] **Step 1: Write failing tests**

Assert final CTA `/signup`. Assert footer links only to `/`, `#product`, `#how-it-works`, `#faq`, `/help`, `/support`, `/privacy`, `/terms`, `/data-deletion`, `/login`, and that the oversized wordmark reads `Linkar`.

- [ ] **Step 2: Implement**

Final CTA uses the soft-lilac field and a locally built conversation fragment. Footer uses four link columns on desktop, two columns on mobile, an oversized responsive wordmark, current year, and truthful platform disclaimer. No external links.

- [ ] **Step 3: Verify and commit**

```bash
pnpm vitest run src/components/marketing/final-cta.test.tsx src/components/marketing/marketing-footer.test.tsx
pnpm typecheck
git add src/components/marketing/final-cta.* src/components/marketing/marketing-footer.*
git commit -m "feat(marketing): finish conversion banner and footer"
```

---

### Task 12: Assemble the marketing page and integrate route tests

**Files:**
- Create: `src/components/marketing/marketing-page.tsx`
- Create: `src/components/marketing/marketing-page.test.tsx`
- Create: `src/components/marketing/marketing-page.module.css`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Modify: `e2e/smoke.spec.ts`
- Modify: `e2e/theme-and-preview.spec.ts`
- Modify: `e2e/responsive-visual-system.spec.ts`

**Interfaces:**
- Consumes: all marketing section components.
- Produces: final public route `/`.

- [ ] **Step 1: Write failing page integration test**

Assert a single H1, all twelve landmark sections in order, at least two signup CTAs, `/login`, `#product`, `#how-it-works`, and `#faq`. Assert rendered text excludes prohibited third-party identifiers.

- [ ] **Step 2: Assemble the page**

`MarketingPage` imports sections in topology order and wraps them in `<main className={styles.page}>`. `app/page.tsx` imports and returns `<MarketingPage />`. Add only the scoped root resets required for `.marketing-page-root`; do not append a second unscoped design system to `globals.css`.

- [ ] **Step 3: Update E2E route ownership**

Change authenticated root expectations from `/` to `/dashboard`. Add logged-out `/` coverage for hero, signup navigation, mobile menu, FAQ, and zero horizontal overflow at 390/768/1440.

- [ ] **Step 4: Verify and commit**

```bash
pnpm vitest run src/components/marketing/marketing-page.test.tsx
pnpm typecheck
git add app/page.tsx app/globals.css src/components/marketing/marketing-page.* e2e/smoke.spec.ts e2e/theme-and-preview.spec.ts e2e/responsive-visual-system.spec.ts
git commit -m "feat(marketing): launch cinematic public homepage"
```

---

### Task 13: Add origin-safety checks and run full visual QA

**Files:**
- Create: `scripts/check-marketing-origin.mjs`
- Modify: `package.json`
- Create: `docs/design-references/linkar-marketing/root/{desktop-1440,mobile-390}.png`
- Create: `docs/research/linkar-marketing/root/QA.md`

**Interfaces:**
- Produces: `pnpm check:marketing-origin`.

- [ ] **Step 1: Write the scanner**

Implement the scanner with explicit roots: non-test files under `src/components/marketing`, `app/page.tsx`, and every text-readable file under `public/marketing`. Reject the prohibited third-party brand/domain case-insensitively, protocol-relative URLs, and `http://` or `https://` asset references. Accept only Linkar-owned copy, root-relative internal routes, and local `/marketing/...` assets. When `MARKETING_ORIGIN_URL` is set, fetch that homepage, apply the same checks to its HTML, and report the response line containing a violation. Exit nonzero with the offending file or URL and line number; print a one-line success summary otherwise. Keep scanner fixtures out of the scanned roots so the forbidden tokens do not make the scanner fail against itself.

- [ ] **Step 2: Run the complete static verification**

```bash
pnpm check:marketing-origin
pnpm typecheck
pnpm lint
pnpm test
pnpm check:branding
pnpm build
```

Expected: every command exits 0.

- [ ] **Step 3: Run browser behavior QA**

Start the production app, inspect at 1440×1000, 768×900, and 390×844, and verify: header transparency/show-hide, mobile menu/Escape, hero load, proof rail, story chapter activation, runway containment, gallery selection, FAQ keyboard operation, focus visibility, reduced-motion rendering, footer links, and no console errors.

- [ ] **Step 4: Capture Linkar-only QA screenshots and inspect network traffic**

Save full-page desktop/mobile screenshots at the specified paths. Confirm browser requests for `/` contain no third-party domain and no remote image/font/script requests. Record results and any intentionally accepted discrepancy in `QA.md`.

- [ ] **Step 5: Final regression and commit**

```bash
pnpm test:e2e --grep "marketing|dashboard|responsive"
git add scripts/check-marketing-origin.mjs package.json docs/design-references/linkar-marketing/root docs/research/linkar-marketing/root/QA.md
git commit -m "test(marketing): verify origin safety and responsive QA"
git status --short --branch
```

Expected: targeted E2E passes and the worktree is clean.
