# Automation Workspace Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Facebook activation, add Reel-first Quick Automation and full Insights destinations, upgrade Facebook preview, and normalize authenticated workspace layouts.

**Architecture:** Keep the existing automation API and data model. Add small client screens around the existing media, template, and insights contracts; extend the builder's explicit inputs for media preselection and activation intent; centralize only the shared presentation rules needed by all workspace routes.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.9, Vitest/Testing Library, Playwright, Prisma 6, existing CSS design tokens.

**Spec:** `docs/superpowers/specs/2026-09-02-automation-workspace-refresh-design.md`

## Global Constraints

- Use the installed Next.js 16.3.1 documentation under `node_modules/next/dist/docs/` before changing App Router code.
- Use failing tests before every production behavior change.
- Quick Automation covers connected Instagram Reels; Facebook Page flows remain in the full builder.
- Keep Sequences and Broadcasts routes functional but remove them from primary navigation.
- Persist stable media identifiers/snapshots only; never persist transient Meta CDN URLs.
- Preserve the current monochrome workspace and yellow interaction accent.
- Do not use subagents.
- Deploy only after focused tests, full tests, lint, typecheck, build, Playwright, and Brave visual QA succeed.

---

### Task 1: Classic and Facebook activation

**Files:**
- Modify: `src/components/automation-builder.tsx`
- Test: `src/components/automation-builder.test.tsx`

**Interfaces:**
- Consumes: existing `POST /api/automations` and `PATCH /api/automations/:id` contracts.
- Produces: classic-builder final actions `save("draft" | "activate")` with accurate final-state feedback.

- [ ] **Step 1: Write failing activation tests**

Add tests that walk a Facebook classic flow to review, assert both `Save draft` and `Save & activate`, click activation, and require a create request followed by `PATCH { status: "ACTIVE" }`. Add an activation-failure test that requires `Saved as a draft, but activation failed.`. Add an edit test proving an active record is not demoted by `Save changes`.

```tsx
fireEvent.click(screen.getByRole("button", { name: /save & activate/i }));
await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) =>
  String(url) === "/api/automations/automation_new" &&
  (init as RequestInit).method === "PATCH" &&
  JSON.parse(String((init as RequestInit).body)).status === "ACTIVE"
)).toBe(true));
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/components/automation-builder.test.tsx`

Expected: FAIL because the classic builder renders only `Save automation` and never sends an activation PATCH.

- [ ] **Step 3: Implement intent-aware classic saving**

Replace `saved: boolean` with an intent result, change the submit path to accept `"draft" | "activate"`, and render two final buttons. After the complete save succeeds, activate the returned/current ID when requested.

```ts
type SaveIntent = "draft" | "activate";

async function save(intent: SaveIntent) {
  const savedRecord = await saveCompleteDefinition();
  if (intent === "activate") {
    await patchStatus(savedRecord.id, "ACTIVE");
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/components/automation-builder.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/automation-builder.tsx src/components/automation-builder.test.tsx
git commit -m "fix: activate classic and Facebook automations"
```

### Task 2: Stable Reel preselection contract

**Files:**
- Modify: `src/lib/automation/new-automation-target.ts`
- Modify: `src/lib/automation/new-automation-target.test.ts`
- Modify: `app/automations/new/page.tsx`
- Modify: `src/components/automation-builder.tsx`
- Test: `src/components/automation-builder.test.tsx`

**Interfaces:**
- Produces: `parseNewAutomationTarget(params).initialMediaIds: string[]` and `AutomationBuilder` prop `initialMediaIds?: string[]`.
- Consumes: URL query `media=<Meta media id>`.

- [ ] **Step 1: Write failing parser and builder tests**

Require a trimmed media ID to become one initial selected ID, reject missing/blank media IDs, and require the campaign builder's media checkbox to be selected once the API returns that Reel.

```ts
expect(parseNewAutomationTarget({ media: " reel_1 " })).toMatchObject({
  initialMediaIds: ["reel_1"],
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/automation/new-automation-target.test.ts src/components/automation-builder.test.tsx`

Expected: FAIL because `media` and `initialMediaIds` are not accepted.

- [ ] **Step 3: Implement preselection**

Extend the page search-param type and parser, then merge selected IDs into the campaign definition without adding URLs. Pass `initialMediaIds` through `AutomationBuilder` to the v2 builder and seed its `mediaIds` state.

```ts
const initialMediaIds = typeof params.media === "string" && params.media.trim()
  ? [params.media.trim()]
  : [];
```

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run src/lib/automation/new-automation-target.test.ts src/components/automation-builder.test.tsx`

```bash
git add app/automations/new/page.tsx src/lib/automation/new-automation-target.ts src/lib/automation/new-automation-target.test.ts src/components/automation-builder.tsx src/components/automation-builder.test.tsx
git commit -m "feat: preselect Reel targets in automation builder"
```

### Task 3: Quick Automation Reel-to-flow screen

**Files:**
- Create: `src/components/quick-automation-screen.tsx`
- Create: `src/components/quick-automation-screen.test.tsx`
- Create: `app/quick-automation/page.tsx`
- Create: `app/quick-automation/loading.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: paginated `GET /api/meta/media`, `basicAutomationTemplates`, and `TEMPLATE_EXAMPLES`.
- Produces: navigation to `/automations/new?type=classic&template=<id>&media=<id>` or `/automations/new?type=campaign&media=<id>`.

- [ ] **Step 1: Write failing screen tests**

Cover filtering out feed posts, selecting one Reel, revealing compatible comment flows, loading the next cursor page, and routing with both stable IDs.

```tsx
fireEvent.click(await screen.findByRole("button", { name: /select reel giveaway/i }));
fireEvent.click(screen.getByRole("button", { name: /auto-dm links from comments/i }));
expect(router.push).toHaveBeenCalledWith(
  "/automations/new?type=classic&template=comment-link-dm&media=reel_1",
);
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/components/quick-automation-screen.test.tsx`

Expected: FAIL because the screen does not exist.

- [ ] **Step 3: Build the screen and routes**

Implement an accessible two-step selection screen with Reel cards, selected state, `Load more`, retry/reconnect empty states, and comment-compatible recipe cards. Use `AppShell`, encode every query value, and keep fetching logic abort-safe.

```ts
const commentTemplates = basicAutomationTemplates.filter((template) =>
  template.provider === "INSTAGRAM" && template.surface === "COMMENT"
);
```

- [ ] **Step 4: Add responsive styling**

Add `.quick-automation-*` rules using the existing spacing, radius, line, accent, and typography variables. Use a 4/3/2/1-column responsive Reel grid and visible `:focus-visible` states.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm vitest run src/components/quick-automation-screen.test.tsx`

```bash
git add app/quick-automation src/components/quick-automation-screen.tsx src/components/quick-automation-screen.test.tsx app/globals.css
git commit -m "feat: add Reel-first quick automation"
```

### Task 4: Primary navigation cleanup

**Files:**
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `src/components/automations-screen.tsx`
- Modify: `src/components/automations-screen.test.tsx`

**Interfaces:**
- Produces: sidebar links for `/quick-automation` and `/insights`; no primary links for sequences/broadcasts.

- [ ] **Step 1: Write failing navigation tests**

Assert Quick Automation and Insights links exist, Sequences and Broadcasts do not appear in the workspace sidebar, and the Automations page no longer renders `Automation sections`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/components/app-shell.test.tsx src/components/automations-screen.test.tsx`

Expected: FAIL on the old navigation.

- [ ] **Step 3: Update navigation and Automations layout**

Use `Zap` for Quick Automation and `ChartNoAxesCombined` for Insights. Remove `AutomationSectionNav` from the Automations screen and collapse `.section-layout` to the normal page content width.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run src/components/app-shell.test.tsx src/components/automations-screen.test.tsx`

```bash
git add src/components/app-shell.tsx src/components/app-shell.test.tsx src/components/automations-screen.tsx src/components/automations-screen.test.tsx
git commit -m "feat: simplify workspace navigation"
```

### Task 5: Full Insights destination

**Files:**
- Create: `src/components/insights-screen.tsx`
- Create: `src/components/insights-screen.test.tsx`
- Create: `app/insights/page.tsx`
- Create: `app/insights/loading.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: unscoped `GET /api/insights` payload: `funnel`, `timeseries`, `mediaPerformance`, `capturedEmails`, `optedOut`, and `usage`.
- Produces: accessible metrics, 14-day chart, funnel, media table, and `/api/insights/export` link.

- [ ] **Step 1: Write failing insights tests**

Require hand-calculated totals from literal day fixtures, zero-safe conversion rates, top-media rows, error/empty states, and the export URL.

```tsx
expect(await screen.findByText("9")).toBeTruthy();
expect(screen.getByRole("link", { name: /export csv/i }).getAttribute("href"))
  .toBe("/api/insights/export");
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/components/insights-screen.test.tsx`

Expected: FAIL because the screen does not exist.

- [ ] **Step 3: Build the Insights screen and routes**

Reuse `MetricCard` and implement local chart/funnel components with semantic labels. Show explicit empty states instead of zero-height graphics and a retry button on fetch failure.

- [ ] **Step 4: Add responsive Insights styling**

Add `.insights-page-*` styles with a responsive metric grid, horizontally safe chart, two-column desktop detail grid, and single-column mobile layout.

- [ ] **Step 5: Verify GREEN and commit**

Run: `pnpm vitest run src/components/insights-screen.test.tsx app/api/insights/route.test.ts`

```bash
git add app/insights src/components/insights-screen.tsx src/components/insights-screen.test.tsx app/globals.css
git commit -m "feat: add workspace insights page"
```

### Task 6: Facebook device preview

**Files:**
- Modify: `src/components/facebook-page-preview.tsx`
- Create: `src/components/facebook-page-preview.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Preserves: existing `FacebookPagePreviewProps`.
- Produces: `.facebook-device` shell with status bar, app header, post surface, comment/reply hierarchy, composer, and home indicator.

- [ ] **Step 1: Write failing preview test**

Require the device shell, Page identity, nested reply, preview-only label, and accessible comment region while verifying the supplied Page/avatar/reply data is rendered.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/components/facebook-page-preview.test.tsx`

Expected: FAIL because `.facebook-device` and the upgraded chrome do not exist.

- [ ] **Step 3: Implement and style the preview**

Keep the component pure and reuse the existing `phone-only-heading` accessibility pattern. Add Facebook-specific device classes without weakening Instagram selectors.

- [ ] **Step 4: Verify GREEN and commit**

Run: `pnpm vitest run src/components/facebook-page-preview.test.tsx src/components/automation-builder.test.tsx`

```bash
git add src/components/facebook-page-preview.tsx src/components/facebook-page-preview.test.tsx app/globals.css
git commit -m "feat: upgrade Facebook automation preview"
```

### Task 7: Authenticated layout and responsive QA pass

**Files:**
- Modify: `app/globals.css`
- Modify: `e2e/responsive-visual-system.spec.ts`
- Test: `app/globals.test.ts`
- Test: existing colocated tests for every component whose markup changes during the pass

**Interfaces:**
- Produces: shared workspace width/padding/header/card/grid behavior and no horizontal document overflow from 360px upward.

- [ ] **Step 1: Capture baseline screenshots and identify concrete overflow/spacing failures**

Run the local app and inspect Home, Automations, Quick Automation, Insights, Contacts, Inbox, Settings, Profile, Help, builder, edit, activity, Sequences, and Broadcasts at 1440×900, 1024×768, 768×1024, and 390×844. Record only reproducible failures.

- [ ] **Step 2: Add failing tests for each structural failure**

Use existing component tests for semantic/layout-class behavior and Playwright viewport assertions for real overflow:

```ts
expect(await page.evaluate(() => document.documentElement.scrollWidth))
  .toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
```

- [ ] **Step 3: Normalize shared CSS and targeted markup**

Standardize `.page-wrap`, `.page-header`, responsive panel grids, action wrapping, table overflow containers, builder columns, and mobile sidebar/content offsets. Remove one-off spacing rules only when their consumers are covered by the new shared rule.

- [ ] **Step 4: Verify focused and full UI tests**

Run: `pnpm vitest run src/components app/globals.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css app/globals.test.ts e2e/responsive-visual-system.spec.ts src/components
git commit -m "fix: normalize workspace spacing and responsiveness"
```

### Task 8: Complete verification, Brave QA, and deployment

**Files:**
- Modify only if verification finds a regression.

**Interfaces:**
- Consumes: repository verification and deployment scripts.
- Produces: verified production release.

- [ ] **Step 1: Run the complete local gate**

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm test:e2e
```

All commands must exit 0 with no ignored failures.

- [ ] **Step 2: Inspect local UI at target viewports**

Revisit every authenticated route from Task 7. Confirm focus visibility, mobile drawer behavior, no clipped actions, readable tables/cards, Quick Automation handoff, Insights empty/data states, and both previews.

- [ ] **Step 3: Deploy through the existing Coolify script**

Run: `pnpm deploy:coolify`

Wait for a successful deployment result. Do not substitute a different deploy path.

- [ ] **Step 4: Verify production in Brave**

Using the requested Linkar account in Brave, confirm sidebar destinations, Reel loading, recipe handoff, Insights rendering, Facebook preview, draft saving, and activation. Avoid generating third-party social replies; activation verification may use a narrowly scoped automation and immediately pause it after confirming the `ACTIVE` state.

- [ ] **Step 5: Report evidence**

Report commit IDs, command results, deployed revision, production URL, and any residual external Meta limitation separately from application defects.
