# Inbox Operations and Production Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a scalable text-only Instagram inbox with operational states, paginated Facebook Page activity, verified follow-gated production configuration, repaired browser coverage, and recorded live Meta smoke results.

**Architecture:** Extend `AutomationContact` additively for durable inbox state, add versioned cursor contracts to focused repository queries, and keep Instagram conversations separate from non-messageable Facebook Page-comment activity. Route handlers validate filters and mutations; focused client components render each inbox view. Production capabilities are exposed as safe health metadata and verified before live provider smoke tests.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 5.9, Prisma 6/PostgreSQL, Vitest, Testing Library, Playwright, BullMQ/Valkey, Meta Graph APIs, Coolify

**Spec:** `docs/superpowers/specs/2026-09-04-inbox-operations-and-production-readiness-design.md`

## Global Constraints

- Instagram inbox replies remain text-only and capped at 1,000 characters.
- Do not add attachments, image messages, voice messages, internal notes, Facebook Messenger, WhatsApp, or provider-history scraping.
- Facebook Page commenters remain activity records, never messageable contacts.
- Existing `tags` are inbox labels and existing `assigneeUserId` is assignment state.
- Every API is workspace-scoped and every cursor is opaque, versioned, URL-safe, and strictly validated.
- Invalid cursors and invalid filters return HTTP 400; missing or foreign records return HTTP 404.
- Use additive migrations only and preserve all existing contacts and history.
- Never print access tokens, app secrets, passwords, cookies, or raw provider payloads during production verification.

---

### Task 1: Add inbox persistence fields and cursor primitives

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260904130000_add_inbox_operational_state/migration.sql`
- Create: `src/lib/inbox-cursor.ts`
- Create: `src/lib/inbox-cursor.test.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`

**Interfaces:**
- Produces `InboxStatus = "OPEN" | "CLOSED"` and four fields on `AutomationContactRecord`: `inboxStatus`, `inboxFavorite`, `inboxReminderAt`, and `inboxLastReadAt`.
- Produces `encodeInboxCursor(input)` and `decodeInboxCursor(value, kind)` for contacts, messages, and activity.

- [ ] **Step 1: Write failing cursor tests**

```ts
expect(decodeInboxCursor(encodeInboxCursor({ kind: "contacts", at: "2026-09-04T10:00:00.000Z", id: "contact_1" }), "contacts"))
  .toEqual({ version: 1, kind: "contacts", at: "2026-09-04T10:00:00.000Z", id: "contact_1" });
expect(() => decodeInboxCursor("not-a-cursor", "contacts")).toThrow("invalid_cursor");
expect(() => decodeInboxCursor(encodeInboxCursor({ kind: "messages", at: "2026-09-04T10:00:00.000Z", id: "m1" }), "contacts"))
  .toThrow("invalid_cursor");
```

- [ ] **Step 2: Run the cursor test and confirm RED**

Run: `pnpm vitest run src/lib/inbox-cursor.test.ts`

Expected: FAIL because `src/lib/inbox-cursor.ts` does not exist.

- [ ] **Step 3: Implement the strict versioned cursor codec**

```ts
export type InboxCursorKind = "contacts" | "messages" | "activity";
export type InboxCursor = { version: 1; kind: InboxCursorKind; at: string; id: string };
export function encodeInboxCursor(input: Omit<InboxCursor, "version">): string;
export function decodeInboxCursor(value: string, expectedKind: InboxCursorKind): InboxCursor;
```

Use `Buffer.from(JSON.stringify(...)).toString("base64url")`, reject malformed JSON, unknown keys, non-ISO timestamps, blank IDs, versions other than `1`, and mismatched kinds.

- [ ] **Step 4: Add the additive Prisma fields and indexes**

```prisma
inboxStatus       String   @default("OPEN")
inboxFavorite     Boolean  @default(false)
inboxReminderAt   DateTime?
inboxLastReadAt   DateTime?

@@index([workspaceId, inboxStatus, lastSeenAt, id])
@@index([workspaceId, inboxReminderAt, id])
@@index([workspaceId, lastSeenAt, id])
```

Generate a migration containing only `ALTER TABLE ... ADD COLUMN` and `CREATE INDEX` statements.

- [ ] **Step 5: Extend repository record mapping and memory defaults**

Map nullable dates to ISO strings and initialize new memory contacts as `OPEN`, non-favourite, with undefined reminder/read timestamps. Update `touchContact` in both repositories so a newer inbound event sets `inboxStatus` to `OPEN` and does not modify `inboxLastReadAt`.

- [ ] **Step 6: Verify schema and focused tests GREEN**

Run: `pnpm db:generate && pnpm vitest run src/lib/inbox-cursor.test.ts src/lib/automation/conversation-triggers.test.ts`

Expected: all selected tests pass.

- [ ] **Step 7: Commit the persistence foundation**

```bash
git add prisma src/lib/inbox-cursor.ts src/lib/inbox-cursor.test.ts src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts
git commit -m "feat(inbox): add operational conversation state"
```

### Task 2: Implement paginated repository queries

**Files:**
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/inbox.test.ts`
- Create: `src/lib/inbox-repository.test.ts`

**Interfaces:**
- Produces `InboxContactQuery`, `InboxContactPage`, `InboxMessageQuery`, and `WebhookEventPageQuery` types.
- Produces repository methods `listInboxContacts`, `listInboundEventsForRecipient`, `listOutboundDeliveriesForRecipientPage`, `listWebhookEventsPage`, and `updateInboxState`.

- [ ] **Step 1: Write failing memory-repository pagination and filter tests**

Cover stable equal-timestamp pagination, query-before-pagination, open/closed, unread, mine/unassigned, favourite, label, due/scheduled reminder, newest/oldest/unread ordering, per-recipient event isolation, and activity pagination. Assert page one plus page two contains every fixture exactly once.

- [ ] **Step 2: Run focused repository tests and confirm RED**

Run: `pnpm vitest run src/lib/inbox-repository.test.ts`

Expected: FAIL because the new repository methods are absent.

- [ ] **Step 3: Define repository contracts**

```ts
type InboxContactQuery = {
  limit: number; cursor?: InboxCursor; query?: string; status?: "OPEN" | "CLOSED";
  unread?: boolean; assignment?: "mine" | "unassigned"; currentUserId?: string;
  favorite?: boolean; label?: string; reminder?: "due" | "scheduled";
  sort: "newest" | "oldest" | "unread"; now: string;
};
type InboxContactPage = { records: AutomationContactRecord[]; nextCursor?: string };
```

Add parallel page types for recipient messages and webhook activity. `updateInboxState` accepts a discriminated union for mark-read, status, favourite, reminder, and assignment.

- [ ] **Step 4: Implement memory semantics minimally**

Filter the in-memory collections before sorting and slicing. Use `limit + 1` to determine `nextCursor`. Derive unread from the newest inbound event for the exact `(workspaceId, instagramAccountId, igScopedUserId)` identity.

- [ ] **Step 5: Run memory tests GREEN**

Run: `pnpm vitest run src/lib/inbox-repository.test.ts`

Expected: all cases pass.

- [ ] **Step 6: Write Prisma parity tests around query builders**

Extract pure helpers for Prisma `where`, cursor predicates, and order clauses where database integration is unavailable in Vitest. Assert the generated conditions preserve workspace and identity scoping and use `(timestamp,id)` tie-breakers.

- [ ] **Step 7: Implement Prisma queries**

Use database-side `where`, `orderBy`, and `take: limit + 1`. Recipient webhook queries must filter the JSON payload by both account ID and recipient ID. Outbound pages filter indexed scalar fields. Do not call `listRecentWebhookEvents` from the new paginated paths.

- [ ] **Step 8: Run repository and inbox unit tests GREEN**

Run: `pnpm vitest run src/lib/inbox-repository.test.ts src/lib/inbox.test.ts src/lib/prisma.test.ts`

Expected: all selected tests pass.

- [ ] **Step 9: Commit repository pagination**

```bash
git add src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/inbox.test.ts src/lib/inbox-repository.test.ts
git commit -m "feat(inbox): paginate contacts messages and activity"
```

### Task 3: Add inbox pagination and state APIs

**Files:**
- Modify: `app/api/inbox/route.ts`
- Modify: `app/api/inbox/[contactId]/route.ts`
- Create: `app/api/inbox/route.test.ts`
- Modify: `app/api/inbox/[contactId]/route.test.ts`
- Modify: `app/api/activity/route.ts`
- Modify: `app/api/activity/route.test.ts`
- Modify: `src/lib/inbox.ts`

**Interfaces:**
- `GET /api/inbox` returns `{ data: { contacts, nextCursor } }`.
- `GET /api/inbox/[contactId]` returns `{ data: { messages, nextCursor } }`.
- `PATCH /api/inbox/[contactId]` implements one strict state mutation.
- `GET /api/activity` returns `{ data: { items, nextCursor } }` while preserving its existing filters.

- [ ] **Step 1: Write failing route tests**

Assert default/clamped limits, all filter translations, invalid cursor/filter 400s, workspace scoping, member validation for assignment, reminder validation, mark-read behavior, message-page merging, and activity cursors.

- [ ] **Step 2: Run route tests and confirm RED**

Run: `pnpm vitest run app/api/inbox/route.test.ts app/api/inbox/[contactId]/route.test.ts app/api/activity/route.test.ts`

Expected: tests fail on old response shapes and missing PATCH support.

- [ ] **Step 3: Implement strict query parsing**

Use Zod schemas with enumerations from the spec. Clamp `limit` to `1..100` for contacts/activity and `1..100` for messages. Convert repository validation failures to safe 400/404/409 responses.

- [ ] **Step 4: Replace fixed workspace scans**

Call `listInboxContacts` for the roster and the exact recipient page methods for history. Merge inbound/outbound rows newest-first, take `limit + 1`, create a message cursor, then reverse the returned page for chronological display.

- [ ] **Step 5: Implement PATCH operations**

Parse a discriminated union keyed by `action`. Resolve the current workspace member for `assignment=mine`; validate explicit assignees through workspace membership before calling `updateInboxState`.

- [ ] **Step 6: Paginate Facebook activity**

Preserve Instagram mapping behavior for generic activity consumers but return the new object shape. The Inbox UI will request `type=facebook.comment.created`.

- [ ] **Step 7: Run route and inbox tests GREEN**

Run: `pnpm vitest run app/api/inbox/route.test.ts app/api/inbox/[contactId]/route.test.ts app/api/activity/route.test.ts src/lib/inbox.test.ts`

Expected: all selected tests pass.

- [ ] **Step 8: Commit API contracts**

```bash
git add app/api/inbox app/api/activity src/lib/inbox.ts
git commit -m "feat(inbox): add filtered stateful APIs"
```

### Task 4: Build the operational Instagram inbox UI

**Files:**
- Create: `src/components/inbox/inbox-filters.tsx`
- Create: `src/components/inbox/conversation-header-actions.tsx`
- Create: `src/components/inbox/instagram-inbox.tsx`
- Create: `src/components/inbox/instagram-inbox.test.tsx`
- Modify: `src/components/activity-feed.tsx`
- Modify: `src/components/activity-feed.test.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `InstagramInbox` owns roster filters, cursor accumulation, selected contact, earlier-message loading, and optimistic state mutations.
- `InboxFilters` emits the exact query shape accepted by `GET /api/inbox`.
- `ConversationHeaderActions` emits one PATCH operation at a time.

- [ ] **Step 1: Write failing component tests**

Test Load more without duplicates, filter URL parameters, unread mark-on-open, Load earlier messages prepending, open/close, favourite, reminder set/clear, assignment, labels displayed from tags, retry after pagination failure, and mobile back navigation.

- [ ] **Step 2: Run component tests and confirm RED**

Run: `pnpm vitest run src/components/inbox/instagram-inbox.test.tsx src/components/activity-feed.test.tsx`

Expected: FAIL because the focused components do not exist and the old feed has no operations.

- [ ] **Step 3: Extract the existing Instagram desk**

Move existing text composer behavior unchanged into `InstagramInbox`. Preserve 24-hour-window copy, 1,000-character maximum, Enter-to-send, Shift+Enter newline, avatar rendering, and contact detail access.

- [ ] **Step 4: Add filter and pagination controls**

Reset accumulated contacts and cursor when a filter changes. Append subsequent pages by contact ID. Keep existing rows visible when Load more fails and show a retry button.

- [ ] **Step 5: Add operational state actions**

Update the selected contact and roster optimistically, send PATCH, and roll back from a captured snapshot if the request fails. Announce successful/error state with an `aria-live` region. Use a native `datetime-local` input for reminders.

- [ ] **Step 6: Add accessible styling**

Keep controls inside the existing responsive conversation desk. Expose unread text to assistive technology, use colour only as a secondary cue, and ensure the “moving” descender/clipping regression does not return in global styles.

- [ ] **Step 7: Run component tests GREEN**

Run: `pnpm vitest run src/components/inbox/instagram-inbox.test.tsx src/components/activity-feed.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 8: Commit the Instagram inbox UI**

```bash
git add src/components/inbox src/components/activity-feed.tsx src/components/activity-feed.test.tsx app/globals.css
git commit -m "feat(inbox): add conversation operations and pagination"
```

### Task 5: Restore Facebook Page activity in Inbox

**Files:**
- Create: `src/components/inbox/facebook-activity.tsx`
- Create: `src/components/inbox/facebook-activity.test.tsx`
- Create: `src/components/inbox/inbox-workspace.tsx`
- Create: `src/components/inbox/inbox-workspace.test.tsx`
- Modify: `src/components/activity-feed.tsx`
- Modify: `app/activity/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- `InboxWorkspace` renders the Instagram conversations and Facebook activity tabs.
- `FacebookActivity` consumes paginated `/api/activity?type=facebook.comment.created` results and never renders a composer.

- [ ] **Step 1: Write failing tab and Facebook activity tests**

Assert tab switching, comment avatar/name/Page/timestamp/summary/outcome rendering, cursor pagination, search and Page filtering, retry preservation, and absence of Send/Reply controls.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm vitest run src/components/inbox/facebook-activity.test.tsx src/components/inbox/inbox-workspace.test.tsx`

Expected: FAIL because the tabbed workspace does not exist.

- [ ] **Step 3: Implement the tabbed workspace**

Render semantic tab buttons with `aria-selected` and associated tab panels. Keep Instagram mounted only while active so its network state is predictable.

- [ ] **Step 4: Implement Facebook activity pagination and filters**

Fetch only `facebook.comment.created`, append by event ID, and render “Public Page activity only—Facebook Messenger is not enabled” near the list. Derive available Page filters from loaded items without claiming global completeness.

- [ ] **Step 5: Run focused tests GREEN**

Run: `pnpm vitest run src/components/inbox/facebook-activity.test.tsx src/components/inbox/inbox-workspace.test.tsx src/components/activity-feed.test.tsx`

Expected: all selected tests pass.

- [ ] **Step 6: Commit Facebook activity restoration**

```bash
git add src/components/inbox src/components/activity-feed.tsx app/activity/page.tsx app/globals.css
git commit -m "feat(inbox): restore Facebook Page activity"
```

### Task 6: Expose and configure follow-gated capability status

**Files:**
- Modify: `src/lib/health.ts`
- Modify: `src/lib/health.test.ts`
- Modify: `src/lib/admin/system/types.ts`
- Modify: `src/lib/admin/system/service.ts`
- Modify: `src/lib/admin/system/service.test.ts`
- Modify: `src/components/admin/system/system-console.tsx`
- Modify: `.env.production.example`
- Modify: `ops/COOLIFY_DEPLOYMENT.md`

**Interfaces:**
- `/api/health` gains `capabilities.followGatedCampaigns: "enabled" | "disabled"`.
- Admin system snapshot reports the same safe capability state.

- [ ] **Step 1: Write failing health and admin tests**

Set `FOLLOW_GATED_CAMPAIGNS_ENABLED` to `true` and `false` in isolated tests and assert both public health and owner system state report the corresponding safe string without exposing raw environment data.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `pnpm vitest run src/lib/health.test.ts src/lib/admin/system/service.test.ts`

Expected: FAIL because capability metadata is absent.

- [ ] **Step 3: Implement capability reporting**

Read `followGatedCampaignsEnabled` from `getServerEnv()` and map it to `enabled`/`disabled`. Add the owner-console row using the typed snapshot value.

- [ ] **Step 4: Update deployment defaults and checks**

Set `FOLLOW_GATED_CAMPAIGNS_ENABLED=true` in `.env.production.example`. Document that web and worker must share the value and add a post-deploy `curl` assertion for the capability field.

- [ ] **Step 5: Run focused tests GREEN**

Run: `pnpm vitest run src/lib/health.test.ts src/lib/admin/system/service.test.ts src/lib/runtime-commands.test.ts`

Expected: all selected tests pass.

- [ ] **Step 6: Commit capability visibility**

```bash
git add src/lib/health.ts src/lib/health.test.ts src/lib/admin/system src/components/admin/system .env.production.example ops/COOLIFY_DEPLOYMENT.md
git commit -m "feat(ops): expose follow-gated rollout status"
```

### Task 7: Repair and extend the Playwright suite

**Files:**
- Modify: `e2e/auth.setup.ts`
- Modify: `e2e/facebook-page-comment-automation.spec.ts`
- Modify: `e2e/features.spec.ts`
- Modify: `e2e/marketing-accessibility.spec.ts`
- Modify: `e2e/marketing-cta-footer.spec.ts`
- Modify: `e2e/responsive-visual-system.spec.ts`
- Modify: `e2e/smoke.spec.ts`
- Modify: `e2e/surfaces.spec.ts`
- Modify: `e2e/theme-and-preview.spec.ts`
- Create: `e2e/inbox-operations.spec.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Produces a green browser suite aligned to current accessible UI behavior.

- [ ] **Step 1: Run the full suite and capture failures by root cause**

Run: `pnpm test:e2e`

Record each failure under product bug, stale selector/copy, auth setup, or environment. Do not modify tests before identifying the category.

- [ ] **Step 2: Repair authentication setup first**

Align signup expectations with the email-confirmation flow. Preserve a deterministic authenticated workspace using the supported local test configuration; never bypass production authentication behavior in application code.

- [ ] **Step 3: Update stale behavior assertions**

Use current accessible roles and names such as `Save & activate`, the current hero/header structure, and distinct exact labels where `Keywords` and `Exclude keywords` coexist. Do not replace meaningful assertions with generic visibility checks.

- [ ] **Step 4: Add inbox operations E2E coverage**

Route fixture APIs to deterministic multi-page responses and verify pagination, filters, unread transition, state actions, older-message loading, Facebook activity, and responsive navigation.

- [ ] **Step 5: Run each repaired spec GREEN**

Run every modified journey individually, for example `pnpm playwright test e2e/facebook-page-comment-automation.spec.ts --project=chromium`, then repeat that exact command with each remaining modified `.spec.ts` file until its failures are resolved at the root cause.

- [ ] **Step 6: Run the complete suite GREEN**

Run: `pnpm test:e2e`

Expected: zero failed tests and no unexpected skipped tests.

- [ ] **Step 7: Commit browser coverage**

```bash
git add e2e playwright.config.ts
git commit -m "test(e2e): align browser journeys with current product"
```

### Task 8: Full local verification and migration rehearsal

**Files:**
- Modify only files required by failures traced to this implementation.

**Interfaces:**
- Produces a release candidate proven by all repository quality gates.

- [ ] **Step 1: Check formatting and schema drift**

Run: `git diff --check && pnpm db:generate`

Expected: exit 0.

- [ ] **Step 2: Run all unit tests**

Run: `pnpm test`

Expected: zero failed test files and zero failed tests.

- [ ] **Step 3: Run static verification**

Run: `pnpm lint && pnpm typecheck`

Expected: exit 0 for both commands.

- [ ] **Step 4: Run production build**

Run: `pnpm build`

Expected: Next.js and worker builds exit 0.

- [ ] **Step 5: Re-run the complete browser suite**

Run: `pnpm test:e2e`

Expected: zero failed tests.

- [ ] **Step 6: Rehearse migrations against a disposable database**

Apply all committed migrations to a fresh disposable PostgreSQL database, then apply the new migration to a restored pre-change schema snapshot. Confirm `prisma migrate status` reports up to date in both cases. Never target production during this rehearsal.

- [ ] **Step 7: Reconcile any corrective changes with their owning task**

Run `git status --short`. If verification required a corrective edit, return to the task that owns that file, rerun that task's focused test command, and amend that task's commit. If verification required no corrective edits, leave the verified commit history unchanged.

### Task 9: Deploy capability and inbox release

**Files:**
- Create: `docs/releases/2026-09-04-inbox-operations-release.md`
- Modify: production configuration through the existing Coolify deployment workflow; do not store secrets in Git.

**Interfaces:**
- Produces a deployed release with migrated schema and enabled follow-gated web/worker configuration.

- [ ] **Step 1: Record the release candidate and rollback point**

Capture the Git commit, current production release from `/api/health`, migration count, and a fresh recoverable database backup path/checksum without printing credentials.

- [ ] **Step 2: Set the production rollout flag**

Set `FOLLOW_GATED_CAMPAIGNS_ENABLED=true` on both web and worker services using the existing Coolify configuration. Confirm no service has a conflicting override.

- [ ] **Step 3: Push and deploy the verified commit**

Use the repository's normal `main` deployment workflow. Apply `pnpm db:migrate:deploy` before sending traffic to code that reads the new columns.

- [ ] **Step 4: Verify production health**

Run: `curl --fail --show-error https://app.linkar.in/api/health`

Expected: deployed release matches Git; database and Redis are `ok`; Instagram and Facebook are `configured`; `capabilities.followGatedCampaigns` is `enabled`.

- [ ] **Step 5: Verify authenticated surfaces without mutation**

Open Dashboard, Inbox Instagram tab, Inbox Facebook activity tab, Contacts, Automations, Settings, Insights, and owner System. Confirm no schema, hydration, or API errors.

- [ ] **Step 6: Write the release record**

Record deployment time, commit, migration, health response fields, rollback reference, and any non-secret observations in `docs/releases/2026-09-04-inbox-operations-release.md`.

### Task 10: Run and record controlled live Meta smoke tests

**Files:**
- Modify: `docs/releases/2026-09-04-inbox-operations-release.md`

**Interfaces:**
- Produces provider-backed pass/fail evidence for four production flows.

- [ ] **Step 1: Identify isolated test targets**

In Linkar production, select or create a reviewer-safe Instagram comment automation, follow-gated automation, and Facebook Page-comment automation bound to explicit test posts. Record only their Linkar names/IDs and public post URLs.

- [ ] **Step 2: Run Instagram comment-to-DM**

From the designated secondary Instagram account, post the exact trigger keyword once. Confirm one inbound event and one successful private reply/delivery in Linkar activity.

- [ ] **Step 3: Run follow-gated delivery**

Start with the secondary account not following, trigger the campaign, tap opt-in, verify the not-following prompt, follow the professional account, tap recheck, and confirm the final link arrives exactly once even after a duplicate recheck.

- [ ] **Step 4: Run the inbox reply**

Open the generated contact in Inbox and send one harmless text reply while the 24-hour window is open. Confirm the outbound message is sent and appears after refresh.

- [ ] **Step 5: Run Facebook Page public reply**

From the separate Facebook test account, add one top-level trigger comment. Confirm exactly one nested Page reply. Add one Page-authored comment and one nested comment and confirm neither creates a loop.

- [ ] **Step 6: Record safe evidence**

For each flow, record timestamp, automation ID/name, safe Linkar event/delivery ID, expected count, actual count, and pass/fail. If a login/test account/post is unavailable, record `BLOCKED` with the precise external dependency instead of simulating success.

- [ ] **Step 7: Commit the completed release record**

```bash
git add docs/releases/2026-09-04-inbox-operations-release.md
git commit -m "docs: record inbox production verification"
git push origin main
```

## Final acceptance checklist

- [ ] Every Instagram contact is reachable through cursor pagination rather than a fixed roster cap.
- [ ] Conversation history loads older pages for the exact contact identity.
- [ ] Unread/read, open/closed, favourite, reminders, assignment, labels, filtering, and sorting work and persist.
- [ ] New inbound activity reopens a closed conversation and makes it unread.
- [ ] Facebook Page comments are visible in Inbox without a Messenger composer.
- [ ] Follow-gated capability is enabled and visible in production health for the deployed release.
- [ ] Unit, lint, typecheck, build, and Playwright gates pass freshly.
- [ ] Real Instagram comment-to-DM, follow-gated, inbox reply, and Facebook Page-comment smoke results are recorded honestly.
- [ ] No attachment, image-message, voice-message, internal-note, Facebook Messenger, or WhatsApp feature was introduced.
