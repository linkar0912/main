# Product UI and Billing Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver clear invite feedback, selectable promotional plans, cleaner navigation/profile/home surfaces, a correct mobile template picker, and removal of the unused Test run workflow.

**Architecture:** Extend the existing invite-code contract with a trusted active plan key and use the existing `ActionNotice` for feedback. Consolidate duplicated presentation into shared components, keep URLs stable, and remove the simulator surface and private route as one bounded deletion.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.9, Prisma 6, Vitest, Testing Library, Playwright, CSS.

**Spec:** `docs/superpowers/specs/2026-09-05-product-ui-billing-polish-design.md`

## Global Constraints

- Read relevant files in `node_modules/next/dist/docs/01-app/` before changing App Router, loading, or navigation code.
- Use semantic theme tokens; no literal white interactive panel backgrounds.
- Fixed feedback uses `role="status"` for success and `role="alert"` for failure.
- Motion must respect `prefers-reduced-motion`.
- Existing invite codes and existing public routes remain valid.
- Use test-first red/green cycles for every behavior change.

---

### Task 1: Selectable invite plans in the service and API

**Files:**
- Modify: `src/lib/billing/premium-invite.ts`
- Modify: `src/lib/billing/premium-invite.test.ts`
- Modify: `app/api/admin/invite-codes/route.ts`
- Modify: `app/api/admin/invite-codes/route.test.ts`

**Interfaces:**
- Consumes: active `PlanDefinition` rows with `key`, `name`, and `isActive`.
- Produces: `create(input: { label: string; planKey: string; createdByUserId: string; expiresAt?: Date | null })` and `POST { label, planKey, expiresAt }`.

- [ ] **Step 1: Write failing service and route tests**

```ts
it("creates an invite for the requested active paid plan", async () => {
  const service = createPremiumInviteService(client);
  await service.create({ label: "Creator trial", planKey: "creator", createdByUserId: "u1" });
  expect(client.planDefinition.findFirst).toHaveBeenCalledWith({
    where: { key: "creator", isActive: true },
    select: { id: true, key: true, name: true, isActive: true },
  });
  expect(client.premiumInviteCode.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ planId: "plan_creator" }) }));
});
```

Add route cases that accept `planKey: "growth"` and reject missing, `free`, retired, or unknown keys with a safe 4xx response.

- [ ] **Step 2: Verify the tests fail for the hard-coded Agency lookup**

Run: `pnpm vitest run src/lib/billing/premium-invite.test.ts app/api/admin/invite-codes/route.test.ts`
Expected: FAIL because `planKey` is not accepted and the service queries `agency`.

- [ ] **Step 3: Implement trusted plan resolution**

Change `CreateInput` to require `planKey: z.string().trim().min(2).max(40)`. Reject `planKey === "free"`, then resolve with `planDefinition.findFirst({ where: { key: input.planKey, isActive: true } })`; throw `invite_plan_unavailable` when absent. Return the plan key/name with the one-time code so UI copy can be accurate.

- [ ] **Step 4: Verify focused tests pass**

Run: `pnpm vitest run src/lib/billing/premium-invite.test.ts app/api/admin/invite-codes/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/billing/premium-invite.ts src/lib/billing/premium-invite.test.ts app/api/admin/invite-codes/route.ts app/api/admin/invite-codes/route.test.ts
git commit -m "feat: select plans for premium invites"
```

### Task 2: Admin invite creation redesign

**Files:**
- Modify: `src/components/admin/plans-screen.tsx`
- Modify: `src/components/admin/plans-screen.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `Plan[]` already passed to `PlansScreen` and Task 1’s `planKey` API field.
- Produces: plan selector, limit summary, themed panel, and `ActionNotice` feedback.

- [ ] **Step 1: Add failing interaction tests**

Render Creator and Growth plans, select Growth, submit the form, and assert the request body includes `planKey: "growth"`. Assert Free and retired plans are absent, the created-code message names Growth, and errors render in an alert popup.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run src/components/admin/plans-screen.test.tsx`
Expected: FAIL because no plan selector or popup exists.

- [ ] **Step 3: Implement the plan selector and themed presentation**

Pass `plans` into `PremiumInviteManager`, derive `plans.filter(plan => plan.isActive && plan.key !== "free")`, submit the chosen key, and render one selected-plan summary. Use `<ActionNotice tone={tone} message={message} onDismiss={dismiss} />`; add `.admin-invite-create` styles using `var(--panel)`, `var(--surface-soft)`, `var(--ink)`, `var(--line)`, and `var(--accent)`.

- [ ] **Step 4: Verify green and dark-token coverage**

Run: `pnpm vitest run src/components/admin/plans-screen.test.tsx app/globals.test.ts`
Expected: PASS with no literal `background: #fff` in the invite selectors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/plans-screen.tsx src/components/admin/plans-screen.test.tsx app/globals.css
git commit -m "feat: redesign admin invite creation"
```

### Task 3: Popup redemption feedback and polished invite card

**Files:**
- Modify: `src/components/billing-settings.tsx`
- Modify: `src/components/billing-settings.test.tsx`
- Modify: `app/api/billing/invite-code/route.ts`
- Modify: `app/api/billing/invite-code/route.test.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: redemption response `{ plan: { key, name }, expiresAt }`.
- Produces: dismissible `ActionNotice` and actual-plan confirmation copy.

- [ ] **Step 1: Write failing tests for every outcome**

Add route coverage for plan name/expiry. In the component test, exercise success, used, active-promotion, expired/revoked, invalid, and network failures; assert fixed popup roles and exact copy from the spec.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run app/api/billing/invite-code/route.test.ts src/components/billing-settings.test.tsx`
Expected: FAIL because Billing uses inline banners and assumes Agency.

- [ ] **Step 3: Implement one notice state**

Replace `message`/invite-related `error` branching with `{ tone: "success" | "error"; message: string } | null`, render `ActionNotice`, and set success from the route’s returned plan and `expiresAt`. Keep billing-load failures inside the billing region. Polish the card with a clear “Invite access” heading, short explanation, code input, and “Apply invite” action.

- [ ] **Step 4: Verify green**

Run: `pnpm vitest run app/api/billing/invite-code/route.test.ts src/components/billing-settings.test.tsx src/components/action-notice.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/billing-settings.tsx src/components/billing-settings.test.tsx app/api/billing/invite-code/route.ts app/api/billing/invite-code/route.test.ts app/globals.css
git commit -m "feat: show invite results in popups"
```

### Task 4: Navigation, policies, and Home behavior

**Files:**
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `src/components/settings-screen.tsx`
- Modify: `src/components/settings-screen.test.tsx`
- Modify: `src/components/dashboard-screen.tsx`
- Modify: `src/components/dashboard-screen.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `useAutomations()` loading and records.
- Produces: `/quick-automation` Home CTA, zero-automation-only recipe section, complete Policies directory, compact footer.

- [ ] **Step 1: Write failing assertions**

Assert Pricing and workspace resource links are absent from `AppShell`; all eight resource links are present under Policies; Home has a Quick Automation link; “Start here” is absent while loading and for one automation, but present for an empty resolved list.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run src/components/app-shell.test.tsx src/components/settings-screen.test.tsx src/components/dashboard-screen.test.tsx`
Expected: FAIL against current unconditional rendering.

- [ ] **Step 3: Implement the navigation behavior**

Remove Pricing and `workspaceResourceLinks` from the shell. Render only copyright in the footer. Add the eight links to Policies. Replace `CreateAutomationButton` in `DashboardGreeting` with `<Link href="/quick-automation">Quick Automation</Link>`. Wrap recipes in `!loading && automations.length === 0`.

- [ ] **Step 4: Verify green**

Run: `pnpm vitest run src/components/app-shell.test.tsx src/components/settings-screen.test.tsx src/components/dashboard-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/app-shell.tsx src/components/app-shell.test.tsx src/components/settings-screen.tsx src/components/settings-screen.test.tsx src/components/dashboard-screen.tsx src/components/dashboard-screen.test.tsx app/globals.css
git commit -m "feat: simplify workspace navigation and home"
```

### Task 5: Shared reply-volume visualization

**Files:**
- Create: `src/components/reply-volume-chart.tsx`
- Create: `src/components/reply-volume-chart.test.tsx`
- Modify: `src/components/dashboard-screen.tsx`
- Modify: `src/components/insights-screen.tsx`
- Modify: `src/components/dashboard-screen.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `ReplyVolumeChart({ sent, reached, days, compact? })` and exported `DayPoint`.
- Consumes: identical daily count arrays from Dashboard and Insights.

- [ ] **Step 1: Write a failing shared-component test**

Assert normalized/sorted days, accessible chart label, sent/reached legend, activity bars, and the “No replies…” empty state.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run src/components/reply-volume-chart.test.tsx`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Extract the shared component**

Move normalization, date formatting, height calculation, legend, and chart markup into the new module. Replace both local `VolumeChart` implementations. `compact` changes only spacing/date-label density, not color or meaning.

- [ ] **Step 4: Verify green**

Run: `pnpm vitest run src/components/reply-volume-chart.test.tsx src/components/dashboard-screen.test.tsx src/components/insights-screen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/reply-volume-chart.tsx src/components/reply-volume-chart.test.tsx src/components/dashboard-screen.tsx src/components/insights-screen.tsx src/components/dashboard-screen.test.tsx app/globals.css
git commit -m "refactor: share reply volume visualization"
```

### Task 6: Profile information architecture

**Files:**
- Modify: `src/components/profile-screen.tsx`
- Modify: `src/components/profile-screen.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: existing account context, `getAccountProfile()`, Instagram accounts, and Facebook Pages.
- Produces: identity header, channel section, account-actions section, and unknown-value skeletons.

- [ ] **Step 1: Write failing layout/content tests**

Assert identity facts have labelled values, unknown verification/date values use skeletons, both channel types appear, account/security actions are grouped, and the old three-column status slab is absent.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run src/components/profile-screen.test.tsx`
Expected: FAIL against the current overview layout.

- [ ] **Step 3: Implement semantic sections**

Keep existing forms and mutations, but reorganize markup under `profile-identity`, `profile-channels`, and `profile-account-actions`. Use `<dl>` for facts and existing `Skeleton` for unresolved values. Add responsive token-based styles.

- [ ] **Step 4: Verify green**

Run: `pnpm vitest run src/components/profile-screen.test.tsx app/globals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/profile-screen.tsx src/components/profile-screen.test.tsx app/globals.css
git commit -m "feat: redesign profile information hierarchy"
```

### Task 7: Mobile template picker and restrained motion

**Files:**
- Modify: `src/components/template-picker-modal.tsx`
- Modify: `src/components/template-picker-modal.test.tsx`
- Modify: `app/globals.css`
- Modify: `e2e/automation-mobile.spec.ts`
- Modify: `e2e/theme-and-preview.spec.ts`

**Interfaces:**
- Produces: full-height mobile sheet with one scrolling results region and horizontally scrolling category tabs.

- [ ] **Step 1: Add failing mobile semantics and E2E checks**

Assert the destination label reads “Works with”; at 390×844 assert close/action controls are visible, category row does not wrap, results scroll independently, and no horizontal page overflow occurs. Add reduced-motion coverage for sheet/notice transitions.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run src/components/template-picker-modal.test.tsx && pnpm playwright test e2e/automation-mobile.spec.ts e2e/theme-and-preview.spec.ts`
Expected: FAIL on current wrapping categories and technical label.

- [ ] **Step 3: Implement the mobile sheet**

At `max-width: 720px`, set the modal to `height: 100dvh`, categories to `flex-wrap: nowrap; overflow-x: auto`, and content to the only vertical scroller. Keep header/search/channel rows fixed inside the flex column. Add interaction-only transitions and a `prefers-reduced-motion: reduce` override.

- [ ] **Step 4: Verify green**

Run: `pnpm vitest run src/components/template-picker-modal.test.tsx && pnpm playwright test e2e/automation-mobile.spec.ts e2e/theme-and-preview.spec.ts`
Expected: PASS at mobile and desktop viewports.

- [ ] **Step 5: Commit**

```bash
git add src/components/template-picker-modal.tsx src/components/template-picker-modal.test.tsx app/globals.css e2e/automation-mobile.spec.ts e2e/theme-and-preview.spec.ts
git commit -m "fix: make template picker work on mobile"
```

### Task 8: Remove Test run everywhere

**Files:**
- Modify: `src/components/automation-builder.tsx`
- Modify: `src/components/automation-builder.test.tsx`
- Delete: `src/components/automation-simulator.tsx`
- Delete: `app/api/automations/simulate/route.ts`
- Delete: `src/lib/automation/simulator.ts`
- Delete: `src/lib/automation/simulator.test.ts`
- Modify: `app/globals.css`

**Interfaces:**
- Removes: the private simulation endpoint and all builder Test run UI.
- Preserves: mobile/desktop customer preview and activation validation.

- [ ] **Step 1: Add a failing absence test**

Update builder tests to assert `queryByRole("region", { name: "Test run" })` is null and add a repository guard that `rg` finds no production reference to `/api/automations/simulate`.

- [ ] **Step 2: Verify red**

Run: `pnpm vitest run src/components/automation-builder.test.tsx`
Expected: FAIL because two builder variants render the simulator.

- [ ] **Step 3: Remove the feature**

Remove both imports/renders, delete the component and route, delete the simulator library only after `rg` proves no other production consumer, and remove `.simulator-*` CSS.

- [ ] **Step 4: Verify green and repository absence**

Run: `pnpm vitest run src/components/automation-builder.test.tsx && ! rg -n "Test run|AutomationSimulator|/api/automations/simulate" src app --glob '!**/*.test.*'`
Expected: PASS and `rg` exits 1 because there are no production matches.

- [ ] **Step 5: Run workstream verification**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm playwright test e2e/automation-mobile.spec.ts e2e/theme-and-preview.spec.ts e2e/marketing-cta-footer.spec.ts`
Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/automation-builder.tsx src/components/automation-builder.test.tsx src/components/automation-simulator.tsx src/lib/automation/simulator.ts app/api/automations/simulate app/globals.css
git commit -m "refactor: remove automation test run"
```
