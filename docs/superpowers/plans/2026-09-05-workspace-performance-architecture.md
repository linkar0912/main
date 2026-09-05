# Workspace Performance Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make current-page data appear quickly by deduplicating shared requests, lazy-loading settings sections, and decoupling account lists from slow health probes.

**Architecture:** Extend the existing lightweight client cache with typed resource keys, freshness, and targeted invalidation. Settings owns section-specific loaders; connection identity and health render independently. Measure server boundaries before changing repository queries.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Vitest, Testing Library, Playwright, Prisma.

**Spec:** `docs/superpowers/specs/2026-09-05-workspace-performance-architecture-design.md`

## Global Constraints

- Read Next.js 16 docs for fetching, caching, Server/Client Components, loading UI, and navigation before implementation.
- Do not add a client data dependency.
- Do not cache failed requests.
- Background refresh preserves last confirmed content.
- Provider health failures cannot erase connected-account identity.
- Record timings without user data, URLs containing tokens, or provider payloads.

---

### Task 1: Typed shared resource cache

**Files:**
- Modify: `src/lib/client/workspace-data.ts`
- Modify: `src/lib/client/workspace-data.test.ts`

**Interfaces:**
- Produces: `getTeamOverview`, `getMessagingSettings`, `getBillingView`, `getInsightsOverview`, and `invalidateWorkspaceResource(key)`.
- Cache entries expose resolved value, one pending promise, fetched timestamp, and fetch identity.

- [ ] Write failing tests for concurrent deduplication, 30-second freshness, failure recovery, targeted invalidation, and one consumer aborting without cancelling another.
- [ ] Run `pnpm vitest run src/lib/client/workspace-data.test.ts`; expect failures for missing resources/freshness.
- [ ] Implement resource-specific caches on the existing `cachedRequest` pattern; shared fetches do not receive caller abort signals, while callers may ignore results after unmount.
- [ ] Run `pnpm vitest run src/lib/client/workspace-data.test.ts`; expect PASS.
- [ ] Commit with `git commit -am "refactor: share workspace resource requests"`.

### Task 2: Settings section-scoped progressive loading

**Files:**
- Modify: `src/components/settings-screen.tsx`
- Modify: `src/components/settings-screen.test.tsx`
- Modify: `src/components/billing-settings.tsx`
- Modify: `src/components/billing-settings.test.tsx`

**Interfaces:**
- Consumes: Task 1 resource functions.
- Produces: active-section loaders and independent connection/health state.

- [ ] Add failing tests proving Policies performs no data calls, Team does not call Meta/Facebook health, Billing performs one cached initial request, and account names render before unresolved health promises.
- [ ] Run `pnpm vitest run src/components/settings-screen.test.tsx src/components/billing-settings.test.tsx`; expect FAIL on eager effects and `Promise.all` blocking.
- [ ] Split Settings effects by `section`; load Instagram/Facebook lists together, then launch both health requests independently. Move team and messaging fetches to their section entry. Replace Billing’s raw initial fetch with `getBillingView()` and invalidate it after successful mutation.
- [ ] Run the focused tests; expect PASS.
- [ ] Commit with `git commit -am "perf: lazy load workspace settings"`.

### Task 3: Reuse shared resources across Profile and Home

**Files:**
- Modify: `src/components/profile-screen.tsx`
- Modify: `src/components/profile-screen.test.tsx`
- Modify: `src/components/dashboard-screen.tsx`
- Modify: `src/components/dashboard-screen.test.tsx`

**Interfaces:**
- Consumes: cached bootstrap, connections, Facebook Pages, and compact insights overview.
- Produces: no duplicate warm-session requests and stale-content background refresh.

- [ ] Add failing request-count tests across AppShell + Profile and AppShell + Dashboard renders.
- [ ] Run focused component tests; expect duplicate or uncached calls.
- [ ] Replace raw overview fetches with Task 1 resources and invalidate connections only after a connection mutation, not every Dashboard focus. On focus, request with freshness semantics and keep current data visible.
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `git commit -am "perf: reuse workspace data across screens"`.

### Task 4: Safe server timing and query evidence

**Files:**
- Create: `src/lib/server-timing.ts`
- Create: `src/lib/server-timing.test.ts`
- Modify: `app/api/workspace/bootstrap/route.ts`
- Modify: `app/api/meta/connection/route.ts`
- Modify: `app/api/facebook/connection/route.ts`
- Modify: `app/api/billing/route.ts`

**Interfaces:**
- Produces: `measureServerOperation(name: AllowedTimingName, operation)` with an allowlisted name and `{ durationMs, ok }` structured log fields.

- [ ] Write failing tests asserting duration/ok output and rejection of arbitrary names or metadata.
- [ ] Run `pnpm vitest run src/lib/server-timing.test.ts`; expect module-not-found failure.
- [ ] Implement the allowlisted timer and wrap repository/service boundaries in the four routes; do not log request bodies, IDs, email, URLs, or errors.
- [ ] Run timer and route tests; expect PASS.
- [ ] Capture production-like p50/p95 timings before changing any query; only split serial query work demonstrated by the timing evidence.
- [ ] Commit with `git add src/lib/server-timing.ts src/lib/server-timing.test.ts app/api/workspace/bootstrap/route.ts app/api/meta/connection/route.ts app/api/facebook/connection/route.ts app/api/billing/route.ts && git commit -m "chore: measure workspace endpoint latency"`.

### Task 5: Navigation request-count and layout-shift verification

**Files:**
- Create: `e2e/settings-performance.spec.ts`
- Modify: `app/settings/loading.tsx`
- Modify: `app/profile/loading.tsx`
- Modify: `app/dashboard/loading.tsx`

**Interfaces:**
- Verifies: request counts, progressive paint, stable shell, and shape-matched skeletons.

- [ ] Add Playwright tests counting API requests while opening Policies, Team, Connections, Billing, Profile, and Home; assert the spec’s request boundaries.
- [ ] Run `pnpm playwright test e2e/settings-performance.spec.ts`; expect FAIL before final loader alignment.
- [ ] Update only mismatched loading compositions so page headings and skeleton geometry match resolved screens.
- [ ] Run `pnpm lint && pnpm typecheck && pnpm vitest run src/lib/client/workspace-data.test.ts src/components/settings-screen.test.tsx src/components/billing-settings.test.tsx src/components/profile-screen.test.tsx src/components/dashboard-screen.test.tsx src/lib/server-timing.test.ts && pnpm playwright test e2e/settings-performance.spec.ts`; expect all PASS.
- [ ] Commit with `git add e2e/settings-performance.spec.ts app/settings/loading.tsx app/profile/loading.tsx app/dashboard/loading.tsx && git commit -m "test: verify fast workspace navigation"`.
