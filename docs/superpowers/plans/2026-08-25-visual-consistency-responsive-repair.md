# Linkar Visual Consistency and Responsive Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair Linkar's authenticated workspace so every route uses one semantic visual system and remains usable without horizontal overflow at 1440px, 768px, and 390px.

**Architecture:** Keep the existing App Router pages and client components. Consolidate presentation in the existing global design system, add only three small semantic wrappers where CSS needs a stable ownership boundary, and cover the result with static token tests, component tests, and deterministic Playwright layout assertions.

**Tech Stack:** Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5.9, global CSS, Vitest 4.1 with Testing Library, Playwright 1.62.

**Spec:** `docs/superpowers/specs/2026-08-25-visual-consistency-responsive-design.md`

## Global Constraints

- Do not change database schemas, API contracts, authentication flows, or automation execution behavior.
- Keep Bricolage Grotesque for display, Manrope for body copy, and JetBrains Mono for compact actions and data labels.
- Reserve Volt `#fff100` for navigation selection and rare brand moments.
- Reserve magenta `#fa0cf7` for focus, selected in-content controls, and the primary chart series.
- Use green, amber, and red only for success, warning, and danger.
- Preserve semantic labels, keyboard behavior, visible focus, reduced-motion support, and dark mode.
- The document must not overflow horizontally at 390px, 768px, or 1440px on any audited authenticated route.
- Standalone mobile actions must expose at least a 44px target.
- Follow the repository's Next.js 16 documentation under `node_modules/next/dist/docs/`; global CSS remains imported only by the root layout.

## File map

- `app/globals.css`: owns the global tokens, component primitives, route-level visual rules, and breakpoints.
- `app/globals.test.ts`: statically enforces semantic color and control-size contracts.
- `src/components/automation-list.tsx`: owns automation row structure and the new `.automation-actions` boundary.
- `src/components/automation-list.test.tsx`: verifies the management controls stay grouped.
- `src/components/sequences-screen.tsx`: owns the new `.sequence-form-actions` grouping.
- `src/components/sequences-screen.test.tsx`: verifies sequence actions stay in one semantic group.
- `src/components/automation-builder.tsx`: owns the new `.field-support` grouping for builder actions and helper copy.
- `src/components/automation-builder.test.tsx`: verifies helper copy cannot become an unowned sibling.
- `src/components/dashboard-screen.tsx`: owns the continuous chart plot wrapper.
- `src/components/dashboard-screen.test.tsx`: verifies chart and badge semantics.
- `e2e/responsive-visual-system.spec.ts`: deterministic cross-route layout assertions at the three target widths.
- `e2e/activity-layout.spec.ts`: extends the existing long-caption regression to phone width.

---

### Task 1: Lock the semantic color and control contracts

**Files:**
- Modify: `app/globals.test.ts`
- Modify: `app/globals.css:1-340`

**Interfaces:**
- Consumes: existing CSS custom properties in `:root` and `[data-theme="dark"]`.
- Produces: stable semantic rules used by every later task: 44px fields/buttons, 40px desktop icon buttons, Volt Popular badge, neutral secondary series, and non-decorative step markers.

- [ ] **Step 1: Add failing CSS contract tests**

Append these cases to `app/globals.test.ts`:

```ts
it("assigns decorative UI colors to stable semantic roles", () => {
  expect(css).toMatch(/\.quickstart-badge\s*{[^}]*background:\s*var\(--volt\)[^}]*color:\s*var\(--ink-strong\)/);
  expect(css).toMatch(/\.bar-participants,\s*\.swatch-participants\s*{[^}]*background:\s*var\(--slate\)/);
  expect(css).toMatch(/\.bar-sent,\s*\.swatch-sent\s*{[^}]*background:\s*var\(--accent\)/);
  expect(css).not.toMatch(/\.quickstart-badge\s*{[^}]*var\(--flame\)/);
  expect(css).not.toMatch(/\.condition-marker,\s*\.guard-marker\s*{[^}]*var\(--violet-soft\)/);
});

it("keeps shared form and icon controls comfortably operable", () => {
  expect(css).toMatch(/\.field input,\s*\.field select,\s*\.field textarea\s*{[^}]*min-height:\s*44px/);
  expect(css).toMatch(/\.icon-button\s*{[^}]*height:\s*40px[^}]*width:\s*40px/);
  expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.icon-button\s*{[^}]*height:\s*44px[^}]*width:\s*44px/);
});
```

- [ ] **Step 2: Run the CSS contract tests and confirm RED**

Run: `pnpm vitest run app/globals.test.ts`

Expected: failures report the current flame badge, grape secondary chart series, 42px fields, 32px icon buttons, and violet guard marker.

- [ ] **Step 3: Implement the minimal semantic primitive changes**

In `app/globals.css`:

```css
.field input, .field select, .field textarea { min-height: 44px; }

.icon-button {
  height: 40px;
  width: 40px;
}

.quickstart-badge {
  background: var(--volt);
  color: var(--ink-strong);
}

.bar-participants, .swatch-participants { background: var(--slate); }
.bar-sent, .swatch-sent { background: var(--accent); }

.condition-marker, .guard-marker {
  background: var(--surface-sunk);
  color: var(--slate);
}

@media (max-width: 600px) {
  .icon-button { height: 44px; width: 44px; }
}
```

Remove or replace the old declarations so selector order cannot restore the deprecated styles. Keep success/warning/danger status rules unchanged.

- [ ] **Step 4: Run the CSS contract tests and confirm GREEN**

Run: `pnpm vitest run app/globals.test.ts`

Expected: all workspace palette contract tests pass.

- [ ] **Step 5: Commit the primitive contract**

```bash
git add app/globals.css app/globals.test.ts
git commit -m "fix(ui): unify semantic colors and control sizes"
```

---

### Task 2: Give action groups stable component boundaries

**Files:**
- Modify: `src/components/automation-list.test.tsx`
- Modify: `src/components/automation-list.tsx:164-235`
- Modify: `src/components/sequences-screen.test.tsx`
- Modify: `src/components/sequences-screen.tsx:210-262`
- Modify: `src/components/automation-builder.test.tsx`
- Modify: `src/components/automation-builder.tsx:1620-1670`

**Interfaces:**
- Consumes: existing buttons, links, callbacks, and accessible labels without changing behavior.
- Produces: `.automation-actions`, `.sequence-form-actions`, and `.field-support` wrappers for Task 3 CSS and Task 5 layout tests.

- [ ] **Step 1: Read the honest-test rules before editing tests**

Read: `~/.codex/plugins/cache/claude-plugins-official/superpowers/6.3.0/skills/test-driven-development/writing-good-tests.md`

Apply its rule: each test must name the production markup change that would make it fail and assert real rendered structure rather than a mock call.

- [ ] **Step 2: Add failing structure tests**

Add these focused assertions to the existing component test files, reusing each file's existing fixtures and fetch stubs:

```tsx
// automation-list.test.tsx
render(
  <AutomationList
    automations={[v2Automation()]}
    loading={false}
    onStatusChange={async () => {}}
    onDuplicate={async () => {}}
    onDelete={async () => {}}
  />,
);
const row = screen.getByRole("article");
const actions = row.querySelector(".automation-actions");
expect(actions).toBeTruthy();
expect(actions?.querySelectorAll("a, button").length).toBe(5);

// sequences-screen.test.tsx
const actionGroup = document.querySelector(".sequence-form-actions");
expect(actionGroup).toBeTruthy();
expect(actionGroup?.textContent).toContain("Add step");
expect(actionGroup?.textContent).toContain("Create sequence");

// automation-builder.test.tsx
const helper = screen.getByText(/rotates between variations/i);
expect(helper.closest(".field-support")).toBeTruthy();
expect(helper.closest(".field-support")?.querySelector("button")?.textContent).toMatch(/add variation/i);
```

Use the existing accessible queries and fixtures in each file; do not introduce snapshots.

- [ ] **Step 3: Run the three focused tests and confirm RED**

Run:

```bash
pnpm vitest run src/components/automation-list.test.tsx src/components/sequences-screen.test.tsx src/components/automation-builder.test.tsx
```

Expected: failures report missing `.automation-actions`, `.sequence-form-actions`, and `.field-support` containers.

- [ ] **Step 4: Group automation management controls**

In `AutomationList`, wrap the non-compact edit/activity/status/duplicate/delete controls in one container without changing their conditional rendering:

```tsx
{!compact && (
  <div className="automation-actions" aria-label={`Actions for ${automation.name}`}>
    {/* existing edit, optional activity, status, optional duplicate, optional delete controls */}
  </div>
)}
```

Keep the compact row link outside this group.

- [ ] **Step 5: Group sequence form actions**

Replace the standalone Add step button plus split footer with:

```tsx
<div className="sequence-form-actions">
  <button type="button" className="button button-secondary" disabled={steps.length >= 10} onClick={addStep}>
    <Plus size={15} /> Add step
  </button>
  <div className="sequence-submit-actions">
    {editingId && <button type="button" className="text-link" onClick={resetForm}>Cancel editing</button>}
    <button className="button button-primary" type="submit" disabled={saving}>
      {saving ? "Saving…" : editingId ? "Save changes" : "Create sequence"}
    </button>
  </div>
</div>
```

Extract the existing inline state update into `addStep()` with the identical 10-step limit and new-step values.

```tsx
function addStep() {
  setSteps((current) => [
    ...current,
    { id: `step-${Date.now()}`, delayHours: 24, text: "" },
  ]);
}
```

- [ ] **Step 6: Group builder support copy**

Replace the Add variation button and following bare `<small>` with:

```tsx
<div className="field-support field-spaced">
  <button type="button" className="button button-secondary" onClick={addReply} disabled={publicReplies.length >= MAX_PUBLIC_REPLIES}>
    <Plus size={15} /> Add variation
  </button>
  <small>Linkar rotates between variations so the same public comment doesn’t repeat.</small>
</div>
```

- [ ] **Step 7: Run the focused tests and confirm GREEN**

Run the same three-file Vitest command from Step 3.

Expected: all focused component tests pass with existing behavior tests unchanged.

- [ ] **Step 8: Commit the component boundaries**

```bash
git add src/components/automation-list.tsx src/components/automation-list.test.tsx src/components/sequences-screen.tsx src/components/sequences-screen.test.tsx src/components/automation-builder.tsx src/components/automation-builder.test.tsx
git commit -m "fix(ui): group related workspace actions"
```

---

### Task 3: Repair spacing rhythm and responsive ownership

**Files:**
- Modify: `app/globals.test.ts`
- Modify: `app/globals.css:671-1380`
- Modify: `app/globals.css:1452-1540`

**Interfaces:**
- Consumes: wrappers from Task 2.
- Produces: non-compounding panel stacks and narrow-screen rules consumed by the Playwright checks in Task 5.

- [ ] **Step 1: Add failing CSS layout-contract tests**

Append to `app/globals.test.ts`:

```ts
it("owns spacing at stack and grid boundaries", () => {
  expect(css).toMatch(/\.profile-main\s*>\s*\.panel,\s*\.profile-side\s*>\s*\.panel\s*{[^}]*margin-bottom:\s*0/);
  expect(css).toMatch(/\.settings-grid\s*>\s*\.panel\s*{[^}]*margin-bottom:\s*0/);
  expect(css).toMatch(/\.field-support\s*{[^}]*display:\s*flex[^}]*flex-direction:\s*column/);
});

it("contains mobile rows and preserves readable actions", () => {
  expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.settings-hero\s*{[^}]*align-items:\s*stretch[^}]*flex-direction:\s*column/);
  expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.automation-row\s*{[^}]*flex-wrap:\s*wrap/);
  expect(css).toMatch(/@media \(max-width:\s*600px\)[\s\S]*?\.wizard-progress-label\s*{[^}]*display:\s*inline/);
  expect(css).toMatch(/\.activity-media\s*{[^}]*max-width:\s*100%[^}]*width:\s*100%/);
});
```

- [ ] **Step 2: Run the CSS tests and confirm RED**

Run: `pnpm vitest run app/globals.test.ts`

Expected: the new stack, mobile containment, and activity-media contracts fail.

- [ ] **Step 3: Implement stack-owned spacing**

Add rules beside their component sections:

```css
.profile-main > .panel,
.profile-side > .panel,
.settings-grid > .panel { margin-bottom: 0; }

.profile-main > .panel { padding-block: var(--space-5); }
.profile-main > .panel:first-child { padding-top: 0; }
.profile-main > .panel + .panel { border-top: 1px solid var(--line); }

.field-support {
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.field-support small { color: var(--muted); font-size: .72rem; line-height: 1.55; }

.sequence-form-actions {
  align-items: center;
  border-top: 1px solid var(--line);
  display: flex;
  gap: var(--space-4);
  justify-content: space-between;
  margin-top: var(--space-5);
  padding-top: var(--space-4);
}
.sequence-submit-actions { align-items: center; display: flex; gap: var(--space-4); }

.automation-actions { align-items: center; display: flex; flex: 0 0 auto; gap: var(--space-2); }
.activity-media { max-width: 100%; min-width: 0; width: 100%; }
```

- [ ] **Step 4: Implement narrow-screen containment**

Inside `@media (max-width: 600px)` add:

```css
.hamburger { height: 44px; width: 44px; }
.mobile-topbar { min-height: 64px; }

.automation-row { align-items: flex-start; flex-wrap: wrap; }
.automation-copy { flex: 1 1 calc(100% - 48px); }
.automation-actions { flex: 1 0 100%; justify-content: flex-end; padding-left: 40px; }
.automation-copy p { white-space: normal; }

.settings-hero { align-items: stretch; flex-direction: column; }
.settings-action { margin-left: 0; width: 100%; }
.settings-action.button { width: 100%; }
.connection-row .button { margin-left: 0; width: 100%; }

.sequence-form-actions,
.sequence-submit-actions { align-items: stretch; flex-direction: column; width: 100%; }
.sequence-form-actions .button,
.sequence-submit-actions .button { width: 100%; }

.wizard-progress { gap: 6px; margin-inline: -18px; padding-inline: 18px; }
.wizard-progress-step { flex: 0 0 auto; min-height: 44px; padding: 8px 10px; }
.wizard-progress-label { display: inline; }

.profile-footer-links a,
.review-link-grid a { min-height: 44px; }
```

Also set `.activity-row-top { width: 100%; }`, `.feed-tools { flex-wrap: wrap; }`, and `.feed-search { min-width: 0; }` in the existing activity media queries.

- [ ] **Step 5: Normalize decorative accents and Help's hero**

Make decorative metric borders and icons neutral, while leaving real status tones unchanged:

```css
.metric-saffron, .metric-mint, .metric-lavender { border-top-color: var(--line-strong); }
.metric-saffron .metric-top svg,
.metric-mint .metric-top svg,
.metric-lavender .metric-top svg { color: var(--slate); }

.help-hero {
  background: linear-gradient(125deg, var(--ink) 0%, #3a1538 72%, var(--accent-hover) 125%);
}
```

Do not alter green/amber/red status badges, notices, or validation messages.

- [ ] **Step 6: Run CSS tests and confirm GREEN**

Run: `pnpm vitest run app/globals.test.ts`

Expected: all color, spacing, control, and mobile contract tests pass.

- [ ] **Step 7: Run affected component tests**

Run:

```bash
pnpm vitest run src/components/app-shell.test.tsx src/components/automation-list.test.tsx src/components/sequences-screen.test.tsx src/components/automation-builder.test.tsx src/components/settings-screen.test.tsx src/components/profile-screen.test.tsx src/components/help-screen.test.tsx
```

Expected: all affected component suites pass.

- [ ] **Step 8: Commit the spacing and responsive system**

```bash
git add app/globals.css app/globals.test.ts
git commit -m "fix(ui): repair responsive spacing and containment"
```

---

### Task 4: Rebuild the dashboard chart as one continuous plot

**Files:**
- Modify: `src/components/dashboard-screen.test.tsx`
- Modify: `src/components/dashboard-screen.tsx:78-124`
- Modify: `app/globals.css:1176-1205`

**Interfaces:**
- Consumes: `DayPoint`, `VolumeChart`, and semantic color rules from Task 1.
- Produces: `.chart-plot` containing `.insights-chart`, used by Task 5 desktop-width assertions.

- [ ] **Step 1: Add failing dashboard semantics tests**

In `src/components/dashboard-screen.test.tsx`, reuse the existing insights and automation fetch stubs and add:

```tsx
it("renders activity as one continuous chart field", async () => {
  render(<DashboardScreen />);
  const chart = await screen.findByRole("img", { name: /daily replies sent and people reached/i });
  expect(chart.closest(".chart-plot")).toBeTruthy();
  expect(chart.querySelectorAll(".chart-column")).toHaveLength(14);
});

it("marks the Popular recipe with the shared brand badge", async () => {
  render(<DashboardScreen />);
  expect((await screen.findByText("Popular")).classList.contains("quickstart-badge")).toBe(true);
});
```

Ensure the stub provides 14 `sentPerDay` points and matching participant points so the non-empty plot renders.

- [ ] **Step 2: Run the dashboard test and confirm RED**

Run: `pnpm vitest run src/components/dashboard-screen.test.tsx`

Expected: the chart has no `.chart-plot` ancestor.

- [ ] **Step 3: Add the chart plot boundary**

Wrap the existing chart and legend:

```tsx
<div className="chart-plot">
  <div className="insights-chart" role="img" aria-label="Daily replies sent and people reached for the last 14 days">
    {/* existing 14 chart columns */}
  </div>
</div>
<p className="chart-legend">...</p>
```

Keep titles, day labels, height calculations, empty-state behavior, and accessible labels unchanged.

- [ ] **Step 4: Style a continuous plot instead of isolated day cards**

Replace the per-day track styling with:

```css
.chart-plot {
  background:
    linear-gradient(to top, var(--line) 1px, transparent 1px) 0 100% / 100% 25%,
    var(--surface-soft);
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  overflow: hidden;
  padding: var(--space-4) var(--space-4) var(--space-3);
}
.insights-chart { align-items: end; display: flex; gap: 7px; min-height: 220px; }
.chart-bars,
.chart-column.is-empty .chart-bars { background: transparent; }
.chart-bars.is-lg { height: 190px; padding: 0 3px; }
```

The plot background communicates the shared time field; empty days remain aligned and labeled without isolated gray blocks.

- [ ] **Step 5: Run dashboard and CSS tests and confirm GREEN**

Run:

```bash
pnpm vitest run src/components/dashboard-screen.test.tsx app/globals.test.ts
```

Expected: both suites pass.

- [ ] **Step 6: Commit the chart repair**

```bash
git add src/components/dashboard-screen.tsx src/components/dashboard-screen.test.tsx app/globals.css
git commit -m "fix(home): balance the performance chart"
```

---

### Task 5: Add deterministic responsive regression coverage

**Files:**
- Create: `e2e/responsive-visual-system.spec.ts`
- Modify: `e2e/activity-layout.spec.ts`

**Interfaces:**
- Consumes: stable class boundaries and CSS contracts from Tasks 1-4.
- Produces: browser-level evidence for every acceptance width and the exact live defects from the audit.

- [ ] **Step 1: Add a failing mobile activity assertion**

Extend `e2e/activity-layout.spec.ts` after the desktop assertions:

```ts
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await expect(page.getByRole("heading", { name: "Campaign activity" })).toBeVisible();

const mobile = await page.evaluate(() => ({
  viewport: window.innerWidth,
  documentWidth: document.documentElement.scrollWidth,
  widestCaption: Math.max(...Array.from(document.querySelectorAll(".activity-caption")).map((element) => element.getBoundingClientRect().right)),
}));
expect(mobile.documentWidth).toBeLessThanOrEqual(mobile.viewport);
expect(mobile.widestCaption).toBeLessThanOrEqual(mobile.viewport);
```

- [ ] **Step 2: Run the activity regression and confirm RED against the pre-fix commit**

Run: `pnpm playwright test e2e/activity-layout.spec.ts --project=chromium`

Expected before Task 3 CSS: document width is approximately 970px at a 390px viewport. When executing the plan sequentially, verify RED by temporarily commenting the new `.activity-media` width rule, run once, then restore it before continuing.

- [ ] **Step 3: Create the cross-route layout test**

Create `e2e/responsive-visual-system.spec.ts` with deterministic routes for connections and automations:

```ts
import { expect, test } from "@playwright/test";

const routes = ["/", "/automations", "/automations/sequences", "/automations/broadcasts", "/settings", "/profile", "/help", "/automations/new?type=classic"];
const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 1000 },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/api/meta/connection", route => route.fulfill({ json: { data: [{ id: "connection_1", igUserId: "ig_1", username: "mybrand", status: "CONNECTED", connectedAt: "2026-08-22T00:00:00.000Z" }] } }));
  await page.route("**/api/meta/connection/health", route => route.fulfill({ json: { data: [{ id: "connection_1", username: "mybrand", status: "CONNECTED", requiredFields: ["comments", "messages"], subscribedFields: ["comments", "messages"], missingFields: [] }] } }));
});

for (const viewport of viewports) {
  test(`authenticated routes stay contained at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator(".page-wrap")).toBeVisible();
      const width = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(width.document, route).toBeLessThanOrEqual(width.viewport);
    }
  });
}
```

- [ ] **Step 4: Add screenshot-specific geometry checks**

Add focused tests to the same file:

```ts
test("mobile settings stacks connection copy above its action", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings");
  const copy = await page.locator(".settings-copy").first().boundingBox();
  const action = await page.locator(".settings-action").first().boundingBox();
  expect(copy!.width).toBeGreaterThan(300);
  expect(action!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
});

test("profile sections use a compact vertical rhythm", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/profile");
  const panels = page.locator(".profile-main > .panel");
  const first = await panels.nth(0).boundingBox();
  const second = await panels.nth(1).boundingBox();
  expect(second!.y - (first!.y + first!.height)).toBeLessThanOrEqual(24);
});

test("mobile builder progress keeps descriptive labels", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/automations/new?type=classic");
  await expect(page.locator(".wizard-progress-label").first()).toBeVisible();
});

test("desktop chart fills the content field", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  const panel = await page.locator(".chart-panel").boundingBox();
  const plot = await page.locator(".chart-plot").boundingBox();
  expect(plot!.width).toBeGreaterThan(panel!.width * 0.9);
});
```

- [ ] **Step 5: Run the new responsive suite and confirm GREEN**

Run:

```bash
pnpm playwright test e2e/responsive-visual-system.spec.ts e2e/activity-layout.spec.ts --project=chromium
```

Expected: all viewport, settings, profile, builder, chart, and long-caption assertions pass.

- [ ] **Step 6: Commit responsive browser coverage**

```bash
git add e2e/responsive-visual-system.spec.ts e2e/activity-layout.spec.ts
git commit -m "test(ui): cover responsive workspace layouts"
```

---

### Task 6: Full verification and authenticated visual review

**Files:**
- Verify only; modify a prior task's owning file if a regression is found.

**Interfaces:**
- Consumes: all preceding task outputs.
- Produces: fresh evidence that the repository and live-like authenticated UI satisfy the spec.

- [ ] **Step 1: Run the complete unit suite**

Run: `pnpm test`

Expected: all Vitest files pass with zero failures.

- [ ] **Step 2: Run lint and type checking**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: both commands exit 0 with no errors.

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

Expected: Prisma generation, Next.js production build, and worker bundle all exit 0.

- [ ] **Step 4: Run the complete end-to-end suite**

Run: `pnpm test:e2e`

Expected: setup and Chromium projects pass with zero failures.

- [ ] **Step 5: Verify the development server with a browser**

Start or reuse `pnpm dev`, then inspect Home, Automations, Settings, Profile, Help, Builder, and Campaign Activity at 1440×1000, 768×900, and 390×844.

For each width verify:

- No error overlay or console error.
- No horizontal document scroll.
- Light and dark themes preserve semantic colors and readable contrast.
- Profile and Settings no longer contain compounded blank bands.
- Sequence and builder action/helper groups match the approved design.
- Home chart reads as one 14-day field.

- [ ] **Step 6: Review the final diff against the specification**

Run:

```bash
git diff 6c4b351..HEAD --check
git diff 6c4b351..HEAD --stat
git status --short
```

Expected: no whitespace errors, only planned files changed, and no uncommitted implementation changes.

- [ ] **Step 7: Request code review**

Dispatch the required reviewer with:

- Description: unified Linkar semantic color, spacing, responsive layout, grouped actions, and continuous dashboard chart.
- Requirements: `docs/superpowers/specs/2026-08-25-visual-consistency-responsive-design.md` and this plan.
- Base SHA: `6c4b351`.
- Head SHA: `git rev-parse HEAD` after Task 5.

Fix every Critical and Important finding, rerun the affected verification command, and interrupt the finished reviewer so it is marked done.
