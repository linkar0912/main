# Profile, Delivery, and Dark Theme Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign My Profile and Settings Delivery into clear responsive layouts, remove decorative Settings strips, and deliver accessible dark mode across the workspace and full marketing site.

**Architecture:** Preserve the existing React component boundaries, theme persistence, routes, forms, and data fetching. Add semantic foreground and marketing surface tokens, restructure Profile and Delivery markup around accessible labeled regions, and migrate marketing CSS modules from fixed light colors to shared theme variables while intentionally preserving branded yellow and dark chapters.

**Tech Stack:** Next.js, React, TypeScript, CSS Modules, global CSS custom properties, Vitest, Testing Library, Playwright-compatible local browser QA.

**Spec:** `docs/superpowers/specs/2026-08-30-profile-delivery-dark-theme-redesign.md`

## Global Constraints

- Execute inline in the current workspace. Do not spawn subagents.
- Do not deploy or change hosting, DNS, Supabase, OAuth, Meta, database, or webhook configuration.
- Keep the existing `linkar-theme` storage behavior and do not add a theme dependency.
- Preserve Profile and Settings forms, endpoints, fetched data, connection behavior, and business rules.
- Keep the marketing channel showcase yellow in both themes, with dark text and white Instagram and Facebook logo holders.
- Use test-first changes for each behavior and commit each completed task separately.
- Use `apply_patch` for hand-written file changes.

## File Map

- Modify: `app/globals.css` for workspace semantic color roles, Profile and Delivery layout rules, strip removal, responsive behavior, and dark contrast fixes.
- Modify: `app/globals.test.ts` for CSS contract regressions covering semantic foreground roles, strip removal, and responsive layouts.
- Modify: `src/components/profile-screen.tsx` for the account overview, facts list, security column, and supporting column structure.
- Modify: `src/components/profile-screen.test.tsx` for Profile region hierarchy and retained channel behavior.
- Modify: `src/components/settings-screen.tsx` for the Delivery two-column layout and explicit quiet-hours status.
- Modify: `src/components/settings-screen.test.tsx` for Delivery hierarchy, controls, status, and retained Settings behavior.
- Modify: `src/components/marketing/marketing-page.module.css` for shared marketing theme roles.
- Modify: `src/components/marketing/marketing-header.module.css` for light and dark solid header, mega menus, mobile sheet, and controls.
- Modify: `src/components/marketing/marketing-header.test.tsx` for solutions and resources menu accessibility and stable theme controls.
- Create: `src/components/marketing/marketing-theme.test.ts` for semantic theme CSS contracts across marketing modules.
- Modify: `src/components/marketing/proof-rail.module.css`.
- Modify: `src/components/marketing/manifesto-section.module.css`.
- Modify: `src/components/marketing/automation-story.module.css`.
- Modify: `src/components/marketing/channel-showcase.module.css`.
- Modify: `src/components/marketing/surface-runway.module.css`.
- Modify: `src/components/marketing/before-after-section.module.css`.
- Modify: `src/components/marketing/workflow-gallery.module.css`.
- Modify: `src/components/marketing/setup-steps.module.css`.
- Modify: `src/components/marketing/faq-section.module.css`.
- Modify: `src/components/marketing/final-cta.module.css`.
- Modify: `src/components/marketing/marketing-footer.module.css`.

---

### Task 1: Establish semantic contrast roles for workspace UI

**Files:**
- Modify: `app/globals.test.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Add failing CSS contract tests**

Add assertions that the light and dark palettes define explicit foreground roles and that filled accent/volt consumers use them:

```ts
it("keeps text readable on brand fills in both themes", () => {
  expect(css).toMatch(/--on-accent:\s*#101116/);
  expect(css).toMatch(/--on-volt:\s*#101116/);
  expect(css).toMatch(/\[data-theme="dark"\]\s*{[^}]*--accent-text:\s*#[0-9a-f]{6}/);
  expect(css).toMatch(/\.quickstart-badge\s*{[^}]*background:\s*var\(--volt\)[^}]*color:\s*var\(--on-volt\)/);
  expect(css).toMatch(/\.wizard-progress-step\.is-active \.wizard-progress-index\s*{[^}]*color:\s*var\(--on-accent\)/);
});
```

Update the existing semantic-role expectation for `.quickstart-badge` from `--ink-strong` to `--on-volt`.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm vitest run app/globals.test.ts`

Expected: FAIL because `--on-accent`, `--on-volt`, and the corrected consumer rules are absent.

- [ ] **Step 3: Add the semantic tokens and migrate unsafe consumers**

In `app/globals.css`, define these roles in the root palette and dark override:

```css
:root {
  --on-accent: #101116;
  --on-volt: #101116;
  --accent-text: #9c079a;
}

[data-theme="dark"] {
  --on-accent: #101116;
  --on-volt: #101116;
  --accent-text: #ff79fd;
}
```

Replace foregrounds on magenta fills with `var(--on-accent)`, foregrounds on yellow fills with `var(--on-volt)`, and magenta text on dark neutral surfaces with `var(--accent-text)`. Cover status pills, wizard progress, preview tabs and bubbles, avatar brands, help search controls, template and quick-start badges, Profile facts, Settings tabs, and other global filled controls found by searching `background: var(--accent)` and `background: var(--volt)`.

- [ ] **Step 4: Run the focused test and lint the file**

Run: `pnpm vitest run app/globals.test.ts && pnpm eslint app/globals.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the contrast foundation**

```bash
git add app/globals.css app/globals.test.ts
git commit -m "style: add semantic brand contrast roles"
```

### Task 2: Restructure My Profile into overview, main, and supporting regions

**Files:**
- Modify: `src/components/profile-screen.test.tsx`
- Modify: `src/components/profile-screen.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add failing Profile hierarchy tests**

Add a test that renders a verified owner and asserts these labeled regions and structured facts:

```tsx
expect(screen.getByRole("region", { name: "Account overview" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Security" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Connected channels" })).toBeTruthy();
expect(screen.getByRole("region", { name: "Workspace links" })).toBeTruthy();

const overview = screen.getByRole("region", { name: "Account overview" });
expect(within(overview).getByText("Role")).toBeTruthy();
expect(within(overview).getByText("Plan")).toBeTruthy();
expect(within(overview).getByText("Email status")).toBeTruthy();
```

Retain the existing Instagram image fallback and Facebook Page tests.

- [ ] **Step 2: Run the Profile tests and confirm the hierarchy test fails**

Run: `pnpm vitest run src/components/profile-screen.test.tsx`

Expected: FAIL because the current `Account summary` region contains channels and facts are loose chips.

- [ ] **Step 3: Refactor Profile markup without changing behavior**

In `profile-screen.tsx`:

- Rename the top region to `Account overview`.
- Keep avatar, display name, email, join date, and resend-verification form there.
- Replace `.account-summary-chips` with a semantic facts list using `dl`, `dt`, and `dd` for Role, Plan, and Email status.
- Create `.profile-layout` with `.profile-main` for the existing password/session card.
- Create `.profile-side` containing the Connected channels card and existing Workspace links card.
- Preserve all form actions, link destinations, connected channel rendering, status text, and fetched data.

The resulting DOM order must be Account overview, then a two-column `.profile-layout` whose `.profile-main` contains Security and whose `.profile-side` contains Connected channels followed by Workspace links.

- [ ] **Step 4: Replace obsolete Profile layout CSS**

Remove `.profile-hero`, `.profile-hero-main`, `.profile-hero-channel`, and `.profile-detail-grid` layout rules. Add:

```css
.profile-overview { display: grid; gap: var(--space-5); }
.profile-overview-main { align-items: center; display: flex; gap: var(--space-4); }
.profile-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.profile-layout { align-items: start; display: grid; gap: var(--space-5); grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); }
.profile-side { display: grid; gap: var(--space-5); position: sticky; top: 24px; }
```

At the existing tablet/mobile breakpoints, collapse `.profile-layout` to one column, remove sticky positioning, and collapse `.profile-facts` without horizontal overflow.

- [ ] **Step 5: Run Profile and CSS contract tests**

Run: `pnpm vitest run src/components/profile-screen.test.tsx app/globals.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the Profile redesign**

```bash
git add src/components/profile-screen.tsx src/components/profile-screen.test.tsx app/globals.css
git commit -m "redesign profile information hierarchy"
```

### Task 3: Redesign Delivery and remove Settings decorative strips

**Files:**
- Modify: `src/components/settings-screen.test.tsx`
- Modify: `src/components/settings-screen.tsx`
- Modify: `app/globals.test.ts`
- Modify: `app/globals.css`

- [ ] **Step 1: Add failing Delivery and strip-removal tests**

In `settings-screen.test.tsx`, click the Delivery navigation button and assert:

```tsx
expect(screen.getByRole("region", { name: "Messaging hours" })).toBeTruthy();
expect(screen.getByRole("complementary", { name: "Delivery safeguards" })).toBeTruthy();
expect(screen.getByText("Quiet hours disabled")).toBeTruthy();
expect(screen.getByLabelText("Start time")).toBeTruthy();
expect(screen.getByLabelText("End time")).toBeTruthy();
expect(screen.getByLabelText("Workspace timezone")).toBeTruthy();
```

In `app/globals.test.ts`, assert that strip pseudo-elements and the summary border are absent:

```ts
expect(css).not.toMatch(/\.channel-settings-card::before/);
expect(css).not.toMatch(/\.facebook-settings-card::before/);
expect(css).not.toMatch(/\.settings-summary-intro\s*{[^}]*border-top/);
```

- [ ] **Step 2: Run focused tests and confirm failure**

Run: `pnpm vitest run src/components/settings-screen.test.tsx app/globals.test.ts`

Expected: FAIL because Delivery is a single stacked panel and the strip selectors still exist.

- [ ] **Step 3: Refactor Delivery markup**

In the `section === "delivery"` branch:

- Wrap content in `.delivery-settings-layout`.
- Give the main panel `aria-label="Messaging hours"`.
- Add a visible status row reading `Quiet hours enabled` or `Quiet hours disabled` based on `quietHoursEnabled`.
- Group checkbox, Start time, End time, and Workspace timezone into `.delivery-controls`.
- Keep the existing field names, input types, values, and submission behavior unchanged.
- Keep Save messaging hours in the main panel action row.
- Put Protection and Environment cards in an `aside` with `aria-label="Delivery safeguards"`.

- [ ] **Step 4: Remove strip styling and add responsive Delivery CSS**

Delete `.settings-summary-intro` yellow top border and both channel-card pseudo-elements. Remove obsolete `position: relative` or overflow rules used only for those strips. Add:

```css
.delivery-settings-layout { align-items: start; display: grid; gap: var(--space-5); grid-template-columns: minmax(0, 1.55fr) minmax(280px, .75fr); }
.delivery-safeguards { display: grid; gap: var(--space-5); }
.delivery-status { align-items: center; display: flex; justify-content: space-between; }
.delivery-controls { display: grid; gap: var(--space-4); }
.delivery-time-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(2, minmax(0, 1fr)); }
```

Collapse the layout and time grid at existing tablet/mobile breakpoints.

- [ ] **Step 5: Run Settings and CSS tests**

Run: `pnpm vitest run src/components/settings-screen.test.tsx app/globals.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the Settings redesign**

```bash
git add src/components/settings-screen.tsx src/components/settings-screen.test.tsx app/globals.css app/globals.test.ts
git commit -m "redesign delivery settings layout"
```

### Task 4: Add semantic marketing theme roles and dark-aware header surfaces

**Files:**
- Create: `src/components/marketing/marketing-theme.test.ts`
- Modify: `src/components/marketing/marketing-page.module.css`
- Modify: `src/components/marketing/marketing-header.module.css`
- Modify: `src/components/marketing/marketing-header.test.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Add failing marketing theme contracts**

Create `marketing-theme.test.ts` to read the relevant CSS modules and verify:

```ts
expect(pageCss).toMatch(/--marketing-canvas:\s*#ffffff/);
expect(pageCss).toMatch(/--marketing-raised:\s*#f2f2ee/);
expect(pageCss).toMatch(/--marketing-panel:\s*#f7f6ef/);
expect(pageCss).toMatch(/--marketing-inverse:\s*#101116/);
expect(pageCss).toMatch(/--marketing-on-inverse:\s*#f4f4f5/);
expect(pageCss).toMatch(/\[data-theme="dark"\][\s\S]*--marketing-canvas:\s*#101116/);
expect(pageCss).toMatch(/\[data-theme="dark"\][\s\S]*--marketing-raised:\s*#1c1d24/);
expect(headerCss).toMatch(/background:\s*var\(--marketing-raised\)/);
expect(headerCss).toMatch(/color:\s*var\(--marketing-text\)/);
```

In `marketing-header.test.tsx`, preserve tests for both Solutions and Resources menus, their escape/outside-click behavior, and the theme toggle label.

- [ ] **Step 2: Run tests and confirm theme contract failure**

Run: `pnpm vitest run src/components/marketing/marketing-theme.test.ts src/components/marketing/marketing-header.test.tsx`

Expected: FAIL because marketing semantic variables are not defined or consumed.

- [ ] **Step 3: Define marketing roles at the marketing root**

In `marketing-page.module.css`, add light defaults and dark overrides:

```css
.root {
  --marketing-canvas: #ffffff;
  --marketing-raised: #f2f2ee;
  --marketing-panel: #f7f6ef;
  --marketing-inverse: #101116;
  --marketing-on-inverse: #f4f4f5;
  --marketing-text: #050505;
  --marketing-muted: #5f6068;
  --marketing-border: rgb(5 5 5 / 14%);
  --marketing-overlay: rgb(5 5 5 / 58%);
  --marketing-on-accent: #101116;
  --marketing-on-volt: #101116;
  color: var(--marketing-text);
  background: var(--marketing-canvas);
}

:global([data-theme="dark"]) .root {
  --marketing-canvas: #101116;
  --marketing-raised: #1c1d24;
  --marketing-panel: #25262e;
  --marketing-inverse: #101116;
  --marketing-on-inverse: #f4f4f5;
  --marketing-text: #f4f4f5;
  --marketing-muted: #b6b7c0;
  --marketing-border: rgb(244 244 245 / 14%);
  --marketing-overlay: rgb(0 0 0 / 68%);
}
```

Remove the global `.marketing-page-root` rule that forces `color-scheme: light` and fixed white/black colors. Retain only global properties that are not theme-specific.

- [ ] **Step 4: Migrate header and menus to semantic roles**

In `marketing-header.module.css`:

- Use marketing surface/text/border/overlay roles for solid frames, open-menu frames, both mega panels, column dividers, mobile menu sheet, mobile actions, and menu controls.
- Keep transparent hero behavior and white text over the dark hero.
- Ensure light top-surface pages use dark text in light mode and light text in dark mode.
- Ensure hover/focus states invert using semantic text and raised roles.
- Preserve current animation timing, layout, escape handling, outside-click behavior, and focus semantics.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/components/marketing/marketing-theme.test.ts src/components/marketing/marketing-header.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit the marketing foundation**

```bash
git add src/components/marketing/marketing-theme.test.ts src/components/marketing/marketing-page.module.css src/components/marketing/marketing-header.module.css src/components/marketing/marketing-header.test.tsx app/globals.css
git commit -m "style: add semantic marketing dark theme"
```

### Task 5: Migrate every marketing section to the theme roles

**Files:**
- Modify: `src/components/marketing/marketing-theme.test.ts`
- Modify: `src/components/marketing/proof-rail.module.css`
- Modify: `src/components/marketing/manifesto-section.module.css`
- Modify: `src/components/marketing/automation-story.module.css`
- Modify: `src/components/marketing/channel-showcase.module.css`
- Modify: `src/components/marketing/surface-runway.module.css`
- Modify: `src/components/marketing/before-after-section.module.css`
- Modify: `src/components/marketing/workflow-gallery.module.css`
- Modify: `src/components/marketing/setup-steps.module.css`
- Modify: `src/components/marketing/faq-section.module.css`
- Modify: `src/components/marketing/final-cta.module.css`
- Modify: `src/components/marketing/marketing-footer.module.css`

- [ ] **Step 1: Expand failing theme contracts across all section modules**

Read every module in `marketing-theme.test.ts` and assert that adaptive sections consume at least one semantic background and text role. Add explicit exceptions for branded fixed chapters:

```ts
expect(channelCss).toMatch(/background:\s*#fff100|background:\s*var\(--volt\)/);
expect(channelCss).toMatch(/color:\s*var\(--marketing-on-volt\)/);
expect(channelCss).toMatch(/\.channelIcon[^}]*background:\s*#ffffff/);
expect(faqCss).toMatch(/background:\s*var\(--marketing-inverse\)/);
expect(footerCss).toMatch(/background:\s*var\(--marketing-inverse\)/);
```

Also assert no adaptive module root still forces both `background: #ffffff` and `color: #050505`.

- [ ] **Step 2: Run the theme contract and confirm failures**

Run: `pnpm vitest run src/components/marketing/marketing-theme.test.ts`

Expected: FAIL for the hard-coded light modules.

- [ ] **Step 3: Migrate upper-page sections**

Update Proof Rail, Manifesto, Automation Story, and Channel Showcase:

- Proof Rail uses `--marketing-raised`, `--marketing-text`, `--marketing-muted`, and `--marketing-border`.
- Manifesto alternates canvas/panel roles without flattening its typography.
- Automation Story keeps its yellow story chapter and dark ink, while surrounding adaptive surfaces use theme roles. Fixed phone/chat simulations remain self-contained.
- Channel Showcase remains yellow in both themes, uses `--marketing-on-volt`, and keeps white Instagram/Facebook logo holders with no yellow/magenta logo background.

- [ ] **Step 4: Migrate mid-page sections**

Update Surface Runway, Before/After, Workflow Gallery, and Setup Steps to semantic canvas, raised, panel, text, muted, border, and inverse roles. Preserve all layout, animation, and fixed brand-accent decisions.

- [ ] **Step 5: Migrate closing sections**

Update FAQ and Footer to remain intentionally dark using `--marketing-inverse` with `--marketing-on-inverse`. Keep Final CTA dark violet, but replace any low-contrast copy/border colors with semantic readable values.

- [ ] **Step 6: Run all marketing component and theme tests**

Run: `pnpm vitest run src/components/marketing`

Expected: PASS.

- [ ] **Step 7: Commit the section migration**

```bash
git add src/components/marketing
git commit -m "style: complete marketing dark mode"
```

### Task 6: Responsive visual QA and complete verification

**Files:**
- Modify as needed: files touched in Tasks 1 through 5 only

- [ ] **Step 1: Start or reuse the local development server**

Run: `pnpm dev`

Expected: Next.js serves `http://localhost:3000` without startup errors.

- [ ] **Step 2: Verify the marketing page visually in both themes**

Use the local browser at desktop and 375px mobile widths. Check:

- transparent hero header, solid scrolled header, Solutions dropdown, Resources dropdown, and mobile sheet;
- readable text and controls on adaptive dark sections;
- intentionally dark hero, FAQ, and footer;
- yellow Automation Story and Channel Showcase with dark text;
- white, background-free Instagram and Facebook logo holders;
- no horizontal overflow and smooth scrolling retained.

- [ ] **Step 3: Verify authenticated layouts visually in both themes**

Check `/profile` and `/settings` at desktop and 375px widths:

- Profile overview facts align and wrap correctly;
- security is primary and channels/links form the support column;
- Delivery main panel and safeguards stack correctly;
- all yellow and magenta fills keep dark readable text;
- no Settings summary or channel-card decorative strips remain;
- no clipped headings, buttons, fields, or sidebars.

- [ ] **Step 4: Add or adjust regression coverage for any visual defect found**

For each defect, first add a failing assertion to the nearest existing test or `marketing-theme.test.ts`, then patch only the responsible CSS/component and rerun the focused test.

- [ ] **Step 5: Run the complete automated suite**

Run:

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm check:branding
pnpm build
```

Expected: all commands exit 0.

- [ ] **Step 6: Validate production Compose when Docker is available**

Run:

```bash
if docker version >/dev/null 2>&1; then
  pnpm check:compose
else
  echo "Docker unavailable; skipping Compose validation"
fi
```

Expected: Compose configuration passes when Docker is installed/running; otherwise report the skipped environmental check without treating it as an application failure.

- [ ] **Step 7: Review the final diff for scope and accidental regressions**

Run:

```bash
git status --short
git diff --check
git diff --stat 3bed107..HEAD
git log --oneline --decorate -8
```

Expected: only approved frontend, tests, spec, and plan changes; no secrets, deployment files, database changes, or unrelated edits.

- [ ] **Step 8: Commit final QA fixes if any**

```bash
git add app/globals.css app/globals.test.ts src/components/profile-screen.tsx src/components/profile-screen.test.tsx src/components/settings-screen.tsx src/components/settings-screen.test.tsx src/components/marketing
git commit -m "test: verify responsive theme redesign"
```

Skip this commit when visual QA required no changes.
