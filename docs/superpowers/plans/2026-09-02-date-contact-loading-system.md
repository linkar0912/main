# Date, Contact Identity, and Loading System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct date chronology and Inbox contact identity, then standardize page-matched loading states across workspace and admin screens.

**Architecture:** Shared date/identity behavior is enforced at API and repository boundaries, while `src/components/skeleton.tsx` provides reusable structural skeleton primitives and named page compositions. Route loaders and client-fetch loaders consume those same compositions so navigation and hydrated loading states do not jump between unrelated layouts.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.9, Prisma 6, Vitest, Testing Library, CSS.

**Spec:** `docs/superpowers/specs/2026-09-02-date-contact-loading-system-design.md`

## Global Constraints

- Cover authenticated workspace screens and all `/admin` screens.
- Keep public authentication/legal pages on the lightweight root loader.
- Preserve the existing dirty worktree and unrelated user changes.
- Do not deploy, push, or commit unless the user explicitly asks.
- Use `apply_patch` for source edits.
- Follow `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`.
- Use test-driven development and verify in local Brave.

---

### Task 1: Normalize Insights dates

**Files:**
- Modify: `src/components/insights-screen.tsx`
- Modify: `src/components/insights-screen.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `normalizeDayPoints(sent: DayPoint[], reached: DayPoint[]): Array<{ day: string; sent: number; reached: number }>` sorted by ISO day.
- Produces: `.chart-date-label` responsive label styling without blank text nodes.

- [ ] Add a failing component test with unsorted, asymmetric series and assert that every day label is rendered in chronological order.
- [ ] Run `pnpm test -- src/components/insights-screen.test.tsx` and confirm the new assertion fails because alternate labels are blank and the data is not merged.
- [ ] Add `normalizeDayPoints`, render the merged sorted points, and replace the index-based blanking rule with a date label on every column.
- [ ] Add responsive CSS that hides selected visual labels only on narrow screens while preserving `aria-label`/title data.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Repair contact chronology and Inbox identity

**Files:**
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `app/api/contacts/route.ts`
- Modify: `app/api/contacts/route.test.ts`
- Modify: `app/api/contacts/[id]/route.ts`
- Create or modify: `app/api/contacts/[id]/route.test.ts`
- Modify: `src/components/contact-detail-modal.tsx`
- Create or modify: `src/components/contact-detail-modal.test.tsx`
- Modify: `src/components/contacts-screen.tsx`
- Modify: `src/components/contacts-screen.test.tsx`

**Interfaces:**
- Contact detail API adds `instagramUsername?: string`.
- `touchContact(workspaceId, instagramAccountId, igScopedUserId, seenAt)` preserves `createdAt <= lastSeenAt` and uses max(existing last seen, incoming seen time).
- Contact list ordering is `lastSeenAt desc, id asc`.

- [ ] Add failing repository/API tests proving an old reconciliation timestamp becomes the first-seen time, an older repeat event cannot move last-seen backward, contacts sort by last-seen, and detail returns the resolved username.
- [ ] Run the focused route/repository tests and confirm the timestamp, ordering, and username assertions fail for the expected reasons.
- [ ] Update both repositories so create uses the historical timestamp for `createdAt` and update uses the maximum last-seen value; order contact lists by `lastSeenAt`.
- [ ] Resolve username in the contact-detail GET route using `resolveInstagramUsernames` and return it with the contact.
- [ ] Add a failing modal test that expects `@tejastelkar9`, never an internal id suffix, and consistent compact dates.
- [ ] Update `ContactDetailModal` and shared date formatting so the modal identity and chronology match Contacts and Inbox.
- [ ] Run focused API, repository, modal, Contacts, and Activity tests until green.

### Task 3: Build the shared loading composition system

**Files:**
- Modify: `src/components/skeleton.tsx`
- Modify: `src/components/skeleton.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces workspace compositions: `DashboardSkeleton`, `AutomationsSkeleton`, `QuickAutomationSkeleton`, `InsightsSkeleton`, `ContactsSkeleton`, `ActivitySkeleton`, `SettingsSkeleton`, `ProfileSkeleton`, `HelpSkeleton`.
- Produces admin compositions: `AdminOverviewSkeleton`, `AdminTableSkeleton`, `AdminDetailSkeleton`.
- Produces content-only variants for hydrated client loading states.

- [ ] Add failing tests for accessible busy regions, correct workspace/admin shell landmarks, Insights metric/chart/list structure, Contacts toolbar/rows, Inbox filters/groups, and the absence of `skeleton-row-bordered` decoration.
- [ ] Run `pnpm test -- src/components/skeleton.test.tsx` and confirm the new structure assertions fail.
- [ ] Refactor `skeleton.tsx` into small structural primitives and named compositions; keep decorative blocks `aria-hidden`.
- [ ] Replace hard-coded inline visual values with skeleton CSS classes and shared spacing/radius variables.
- [ ] Standardize shimmer, canvas, border use, and reduced-motion behavior in `app/globals.css`.
- [ ] Re-run the skeleton and global CSS tests until green.

### Task 4: Wire every route and client loader to the shared system

**Files:**
- Modify: every `app/**/loading.tsx` under workspace and `/admin`
- Modify: `src/components/activity-feed.tsx`
- Modify: `src/components/contacts-screen.tsx`
- Modify: `src/components/insights-screen.tsx`
- Modify: `src/components/automation-list.tsx`
- Modify: `src/components/automation-versions-modal.tsx`
- Modify: related component tests

**Interfaces:**
- Route loaders import one named skeleton composition.
- Client fetch states import the matching content-only skeleton instead of `.loading-line` or generic slabs.

- [ ] Add failing tests that assert each client screen renders its matching loading landmark before data resolves.
- [ ] Replace generic client placeholders with matching content skeletons and preserve error/empty-state branching.
- [ ] Replace generic admin `ScreenSkeleton` loaders with overview/table/detail compositions based on each final page shape.
- [ ] Replace manual Quick Automation and Insights route loaders with their named shared compositions.
- [ ] Run all affected component tests and route-loading tests.

### Task 5: Full verification and visual critique

**Files:**
- Modify only if verification exposes a regression.

**Interfaces:**
- Consumes all prior tasks; produces a locally verified implementation without deployment.

- [ ] Run `pnpm lint` and fix only issues caused by this work.
- [ ] Run `pnpm typecheck` and fix type regressions.
- [ ] Run `pnpm test` and resolve regressions without weakening assertions.
- [ ] Inspect Insights, Contacts, Inbox, representative workspace loaders, and representative admin loaders in Brave at desktop and narrow widths.
- [ ] Confirm chart dates are chronological, Inbox opens the matching handle, first-seen is not later than last-seen, skeletons match final layouts, and excessive separators are absent.
- [ ] Review `git diff --check` and `git status --short`; do not deploy.
