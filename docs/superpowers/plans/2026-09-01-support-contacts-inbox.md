# Support, Contacts, and Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a searchable and measurable Help centre, contextual guidance, a customer Contacts workspace, safe support diagnostics, and a unified social Inbox with human handoff.

**Architecture:** Reuse the existing AppShell, contact repository, contact detail modal, activity events, and connection-health APIs. Add only the missing help-analytics persistence and contact lookup contract; keep UI interactivity in focused client components and keep secrets behind existing authenticated route handlers.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL, Vitest, Testing Library, global CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-support-contacts-inbox.md`

## Global Constraints

- Preserve Instagram/Facebook capability boundaries and never present Facebook Page comments as Messenger conversations.
- Diagnostics must use an explicit allowlist and exclude tokens, secrets, raw errors, message bodies, emails, and contact identifiers.
- Use test-first red-green-refactor for every behavior change.
- Preserve unrelated worktree changes and do not commit, push, or deploy.

---

### Task 1: Help search and analytics persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901123000_help_analytics/migration.sql`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Create: `src/lib/help-search.ts`
- Create: `src/lib/help-search.test.ts`
- Create: `src/lib/help-analytics.test.ts`

**Interfaces:**
- Produces: `searchableArticleText(topicTitle, topicBlurb, question, answerText): string`.
- Produces: `recordHelpSearch(workspaceId, { query, resultCount, createdAt }): Promise<void>`.
- Produces: `recordHelpFeedback(workspaceId, { articleKey, helpful, createdAt }): Promise<void>`.

- [ ] Write failing tests proving answer-only terms match and workspace analytics are isolated.
- [ ] Run `pnpm test src/lib/help-search.test.ts src/lib/help-analytics.test.ts` and confirm failure is caused by missing contracts.
- [ ] Add workspace-cascading `HelpSearchEvent` and `HelpArticleFeedback` models plus the matching SQL migration.
- [ ] Implement memory and Prisma repository methods with 120-character query and article-key bounds.
- [ ] Run the focused tests and keep them green.

### Task 2: Help page redesign, deep links, no-result tracking, and feedback

**Files:**
- Modify: `src/components/help-screen.tsx`
- Modify: `src/components/help-screen.test.tsx`
- Modify: `src/components/skeleton.tsx`
- Modify: `app/globals.css`
- Create: `app/api/help/analytics/route.ts`
- Create: `app/api/help/analytics/route.test.ts`

**Interfaces:**
- Consumes: help repository analytics methods from Task 1.
- Produces: authenticated `POST /api/help/analytics` accepting either `{ kind: "search", query, resultCount }` or `{ kind: "feedback", articleKey, helpful }`.
- Produces: `/help?topic=<topic-id>` topic selection.

- [ ] Write failing component and route tests for the search-only header, answer-body matching, topic deep links, debounced no-result recording, and Helpful/Not helpful controls.
- [ ] Run the focused tests and confirm the intended failures.
- [ ] Replace the hero with an accessible full-width search shell, index answer text, read the topic query on mount, submit analytics, and render feedback controls.
- [ ] Replace the old hero skeleton with one search-field skeleton and add responsive/dark-mode CSS.
- [ ] Run the focused tests and keep them green.

### Task 3: Contextual help links

**Files:**
- Create: `src/components/context-help-link.tsx`
- Create: `src/components/context-help-link.test.tsx`
- Modify: `src/components/automations-screen.tsx`
- Modify: `src/components/sequences-screen.tsx`
- Modify: `src/components/broadcasts-screen.tsx`
- Modify: `src/components/settings-screen.tsx`
- Modify related existing component tests where headers are asserted.

**Interfaces:**
- Produces: `ContextHelpLink({ topic, label? })` rendering a Next Link to `/help?topic=<encoded-topic>`.

- [ ] Write a failing test proving topic-safe Help URLs and accessible link copy.
- [ ] Run the test and confirm the component is missing.
- [ ] Implement the shared link and add it to each requested page header.
- [ ] Run the component and affected screen tests.

### Task 4: Customer Contacts workspace

**Files:**
- Modify: `app/api/contacts/route.ts`
- Create: `app/api/contacts/route.test.ts`
- Create: `app/contacts/page.tsx`
- Create: `app/contacts/loading.tsx`
- Create: `src/components/contacts-screen.tsx`
- Create: `src/components/contacts-screen.test.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/skeleton.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `GET /api/contacts?scope=all&leadStatus=<status>&limit=<n>` returning workspace-scoped full contact summaries while preserving the legacy captured-email response when `scope` is omitted.
- Consumes: existing `listContactsByLeadStatus`, `ContactDetailModal`, and CSV export.

- [ ] Write failing route tests for workspace isolation, lead-stage filtering, and legacy response compatibility.
- [ ] Write failing UI tests for search, stage filters, empty state, export, and opening contact details.
- [ ] Implement the expanded route and Contacts screen/page/loading state.
- [ ] Add Contacts to the workspace sidebar and remove the duplicate captured-email panel from Automations in favor of a Contacts link.
- [ ] Run the focused route, UI, shell, and Automations tests.

### Task 5: Safe copy diagnostics

**Files:**
- Create: `src/lib/support-diagnostics.ts`
- Create: `src/lib/support-diagnostics.test.ts`
- Create: `src/components/copy-diagnostics-button.tsx`
- Create: `src/components/copy-diagnostics-button.test.tsx`
- Modify: `src/components/settings-screen.tsx`

**Interfaces:**
- Produces: `buildSafeDiagnostics({ instagramHealth, facebookHealth, failures, generatedAt }): SafeDiagnostics` using explicit field projection.
- Produces: `CopyDiagnosticsButton` that reads the existing health APIs plus `/api/insights/failures`, writes formatted JSON to `navigator.clipboard`, and announces success/failure.

- [ ] Write failing projection tests with token, email, message, recipient, and raw-error trap fields that must not appear in serialized output.
- [ ] Write a failing browser-component test proving all three APIs are combined and copied.
- [ ] Implement the projector and Settings button using only allowlisted fields.
- [ ] Run the focused diagnostics and Settings tests.

### Task 6: Unified Inbox with contact history and handoff

**Files:**
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `app/api/activity/route.ts`
- Modify: `app/api/activity/route.test.ts`
- Modify: `src/components/activity-feed.tsx`
- Modify: `src/components/activity-feed.test.tsx`
- Modify: `app/activity/page.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `findContactBySender(workspaceId, instagramAccountId, igScopedUserId): Promise<AutomationContactRecord | null>`.
- Extends Activity entries with `channel: "instagram" | "facebook"` and optional `contactId`.
- Consumes: `ContactDetailModal` for timeline, profile, assignment, and handoff controls.

- [ ] Write failing repository and activity-route tests proving Instagram sender-to-contact resolution and Facebook non-resolution.
- [ ] Write failing UI tests for channel filtering, opening Instagram history/handoff, and leaving Facebook rows non-actionable.
- [ ] Implement repository lookup, enriched activity DTOs, interactive Inbox rows, channel filters, and the contact drawer.
- [ ] Rename the customer-facing Activity title/navigation label to Inbox while preserving `/activity`.
- [ ] Run focused repository, route, feed, modal, and shell tests.

### Task 7: Integration and visual verification

**Files:**
- Modify: `e2e/surfaces.spec.ts` only if stable user-visible assertions need coverage.
- Review: all files changed by Tasks 1–6.

**Interfaces:**
- Consumes all earlier task contracts; produces no new runtime API.

- [ ] Run all focused test files touched by this plan.
- [ ] Run `pnpm typecheck`, `pnpm lint`, and `pnpm test`.
- [ ] Run `pnpm build`.
- [ ] Start the local app and visually inspect Help, Contacts, Inbox, and Settings at desktop and mobile widths.
- [ ] Run `git diff --check` and inspect `git status --short` to confirm unrelated files were preserved and nothing was committed or deployed.
