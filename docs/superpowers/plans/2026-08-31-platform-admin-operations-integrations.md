# Platform Admin Operations and Integrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents; execute inline.

**Goal:** Give the platform owner complete, audited, cross-tenant control over Linkar automations, sequences, broadcasts, contacts, tracked links, deliveries, webhook events, and Meta/Facebook integrations without exposing provider secrets.

**Architecture:** Add an admin-only cross-tenant operations repository that returns stable cursor-paginated DTOs and delegates writes to existing domain services so invariants remain centralized. Every mutation passes the owner/AAL2 route guard, reason/idempotency middleware, entitlement and lifecycle checks, and append-only audit writer from the earlier phases. Provider credentials remain server-side and are represented only by derived health metadata.

**Tech Stack:** Next.js 16.3.1 Route Handlers and React Server Components, TypeScript 5.9.3, Prisma 6.19.3, PostgreSQL, Supabase Auth, BullMQ 6.1.2, Redis, Zod 4.4.3, Vitest 4.1.11.

**Spec:** `docs/superpowers/specs/2026-08-31-platform-owner-admin-console-design.md`

## Global Constraints

- Execute only after the accounts and entitlements plan passes its completion gate.
- All reads are cross-tenant only inside `src/lib/admin`; existing customer repositories remain tenant-scoped.
- Admin writes reuse domain services or add domain commands with explicit invariants; route handlers never update arbitrary Prisma rows.
- Lists use opaque `(createdAt, id)` cursors, a maximum page size of 100, deterministic ordering, and filters validated by Zod.
- Every write requires an operator reason, idempotency key, and AAL2; destructive writes additionally require a short-lived challenge from the foundation plan.
- Never serialize access tokens, refresh tokens, client secrets, encrypted payloads, webhook secrets, message bodies, or raw provider responses.
- Retried delivery and webhook work preserves the original durable idempotency key and cannot create a second provider send.
- Allowlisted platform owners and the owner workspace remain protected from all cross-tenant bulk mutations.

---

### Task 1: Build the cross-tenant operations repository and safe DTOs

**Files:**
- Create: `src/lib/admin/operations/types.ts`
- Create: `src/lib/admin/operations/query-schema.ts`
- Create: `src/lib/admin/operations/repository.ts`
- Create: `src/lib/admin/operations/repository.test.ts`
- Modify: `src/lib/admin/cursor.ts`
- Modify: `src/lib/admin/cursor.test.ts`

**Interfaces:**
- Produces `AdminOperationKind = "automation" | "sequence" | "broadcast" | "contact" | "tracked_link" | "delivery" | "webhook"`.
- Produces `AdminOperationFilter` with workspace, status, text, provider, date range, cursor, and limit.
- Produces `AdminOperationPage<T> { items: T[]; nextCursor: string | null }`.
- Produces detail DTOs with workspace name/id, operational state, safe error summary, timestamps, and related-resource counts.

- [x] **Step 1: Write failing pagination and redaction tests**

```ts
it("paginates deterministically when rows share a timestamp", async () => {
  const first = await repository.listDeliveries({ limit: 2 });
  const second = await repository.listDeliveries({ limit: 2, cursor: first.nextCursor! });
  expect(first.items.map(({ id }) => id)).toEqual(["d3", "d2"]);
  expect(second.items.map(({ id }) => id)).toEqual(["d1"]);
});

it("never returns credentials or raw provider payloads", async () => {
  const detail = await repository.getWebhook("hook-1");
  expect(JSON.stringify(detail)).not.toMatch(/accessToken|refreshToken|clientSecret|rawPayload|messageBody/);
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/cursor.test.ts src/lib/admin/operations/repository.test.ts`

Expected: FAIL because the admin operations repository does not exist.

- [x] **Step 3: Implement opaque cursor helpers and strict query validation**

Reuse the signed, versioned HMAC cursor codec from the accounts phase with ISO timestamp and ID payloads; reject malformed, tampered, unknown-version, or future cursors with `400 invalid_cursor`. Clamp `limit` to 100 and reject invalid date/status/provider filters.

- [x] **Step 4: Implement explicit Prisma projections**

Add `list/get` methods for `Automation`, `AutomationSequence`, `Broadcast`, `AutomationContact`, `TrackedLink`, `OutboundDelivery`, and `WebhookEvent`. Use `select` rather than `include`, join only workspace display identity and safe relation counts, and escape `%`/`_` in case-insensitive search terms.

- [x] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/cursor.test.ts src/lib/admin/operations/repository.test.ts && pnpm typecheck`

Expected: pagination, filter, not-found, and redaction tests pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/admin/cursor.ts src/lib/admin/cursor.test.ts src/lib/admin/operations
git commit -m "feat(admin): add cross-tenant operations repository"
```

### Task 2: Expose audited operations list and detail APIs

**Files:**
- Create: `app/api/admin/operations/[kind]/route.ts`
- Create: `app/api/admin/operations/[kind]/route.test.ts`
- Create: `app/api/admin/operations/[kind]/[id]/route.ts`
- Create: `app/api/admin/operations/[kind]/[id]/route.test.ts`
- Create: `src/lib/admin/operations/service.ts`
- Create: `src/lib/admin/operations/service.test.ts`

**Interfaces:**
- `GET /api/admin/operations/:kind` returns one cursor page.
- `GET /api/admin/operations/:kind/:id` returns a safe detail DTO and allowed actions.
- `PATCH` accepts `{ action, reason, input }` through a discriminated Zod union.

- [x] **Step 1: Write failing authorization and validation tests**

```ts
it.each(["anonymous", "member", "owner-aal1"])("rejects %s mutation access", async (identity) => {
  authorizeAdmin.mockResolvedValue(identityFixture(identity));
  expect((await PATCH(requestFor("pause"), context("automation", "a1"))).status).toBe(identity === "anonymous" ? 401 : 403);
});

it("rejects an action not allowed for the operation kind", async () => {
  const response = await PATCH(requestFor("retry"), context("contact", "c1"));
  expect(response.status).toBe(400);
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run app/api/admin/operations src/lib/admin/operations/service.test.ts`

Expected: FAIL because the API and command service do not exist.

- [x] **Step 3: Implement one guarded route boundary**

Await Next.js 16 dynamic `params`, call `requirePlatformOwner({ aal: "aal2" })` for PATCH and the owner read guard for GET, require `X-Idempotency-Key` and reason, then dispatch only to a typed command service. Normalize errors to `400`, `401`, `403`, `404`, `409`, and `503` without stack traces.

- [x] **Step 4: Write the audit envelope around command execution**

Store actor, action, target type/id, workspace ID, reason, request origin, result, and redacted before/after summaries. Replaying an idempotency key returns the stored status/body and does not execute or audit twice.

- [x] **Step 5: Verify GREEN**

Run: `pnpm vitest run app/api/admin/operations src/lib/admin/operations/service.test.ts && pnpm typecheck`

Expected: all route, authorization, validation, idempotency, and audit tests pass.

- [x] **Step 6: Commit**

```bash
git add app/api/admin/operations src/lib/admin/operations
git commit -m "feat(admin): expose guarded operations APIs"
```

### Task 3: Add automation and sequence write controls

**Files:**
- Modify: `src/lib/admin/operations/service.ts`
- Modify: `src/lib/admin/operations/service.test.ts`
- Create: `src/lib/admin/operations/automation-commands.ts`
- Create: `src/lib/admin/operations/automation-commands.test.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/automation-versions.test.ts`

**Interfaces:**
- Automation actions: `update`, `activate`, `pause`, `archive`, `restore_version`.
- Sequence actions: `update`, `activate`, `pause`, `archive`.
- Admin edits use the same validated payload schemas as customer writes and create an immutable version when behavior changes.

- [x] **Step 1: Write failing transition and version tests**

```ts
it("creates a new immutable automation version for an owner edit", async () => {
  await commands.updateAutomation(actor, "a1", validPatch, "correct broken reply");
  expect(repository.createAutomationVersion).toHaveBeenCalledWith(expect.objectContaining({ automationId: "a1", actorUserId: actor.userId }));
});

it.each([["ARCHIVED", "activate"], ["DRAFT", "pause"]])("rejects invalid %s -> %s transition", async (status, action) => {
  repository.automation.status = status;
  await expect(commands.execute(action, actor, "a1", {})).rejects.toMatchObject({ code: "invalid_transition" });
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/operations/automation-commands.test.ts src/lib/automation-versions.test.ts`

Expected: FAIL because cross-tenant commands are absent.

- [x] **Step 3: Implement domain-level commands**

Lock the target row in a short transaction, re-check workspace status and entitlements, validate current-to-next transitions, write before/after summaries, and increment versions atomically. Version restore copies validated version content into a new head version; it never mutates historical rows.

- [x] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/operations/automation-commands.test.ts src/lib/automation-versions.test.ts app/api/automations && pnpm typecheck`

Expected: transitions, concurrency, restoration, and audit summaries pass.

- [x] **Step 5: Commit**

```bash
git add src/lib/admin/operations src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/automation-versions.test.ts
git commit -m "feat(admin): control automations and sequences"
```

### Task 4: Add broadcast, contact, and tracked-link controls

**Files:**
- Modify: `src/lib/admin/operations/service.ts`
- Modify: `src/lib/admin/operations/service.test.ts`
- Create: `src/lib/admin/operations/content-commands.ts`
- Create: `src/lib/admin/operations/content-commands.test.ts`
- Modify: `src/lib/tracked-links.ts`
- Modify: `src/lib/tracked-links.test.ts`

**Interfaces:**
- Broadcast actions: `cancel_pending`, `retry_failed`.
- Contact actions: `update`, `suppress`, `unsuppress`, `assign_automation`, `delete`, `export_one`.
- Tracked-link actions: `update_destination`, `disable`, `enable`, `delete`.

- [x] **Step 1: Write failing safety tests**

```ts
it("cancels only unsent broadcast deliveries", async () => {
  await commands.cancelBroadcast(actor, "b1", "customer request");
  expect(repository.cancelDeliveries).toHaveBeenCalledWith("b1", { statuses: ["PENDING", "RETRYABLE"] });
});

it("blocks unsafe link protocols", async () => {
  await expect(commands.updateTrackedLink(actor, "l1", { destinationUrl: "javascript:alert(1)" }, "fix link"))
    .rejects.toMatchObject({ code: "invalid_destination" });
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/operations/content-commands.test.ts src/lib/tracked-links.test.ts`

Expected: FAIL because admin content commands do not exist.

- [x] **Step 3: Implement guarded commands**

Broadcast retry selects failed terminal recipients without a recorded provider message ID, creates retryable work with the original logical send key, and leaves successful sends untouched. Contact suppression prevents future dispatch; deletion checks linked execution/delivery history and performs the existing privacy-safe deletion path rather than cascading blindly. Link edits allow only `https:` and explicitly approved development `http:` hosts.

- [x] **Step 4: Implement safe single-contact export**

Return a streamed CSV with a fixed column list, UTF-8 content type, attachment filename, and formula-injection escaping for cells starting with `=`, `+`, `-`, `@`, tab, or carriage return. Do not export provider payloads or secrets.

- [x] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/operations/content-commands.test.ts src/lib/tracked-links.test.ts app/api/broadcasts app/api/contacts app/api/links && pnpm typecheck`

Expected: partial-cancel, safe retry, suppression, deletion, URL validation, and export tests pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/admin/operations src/lib/tracked-links.ts src/lib/tracked-links.test.ts
git commit -m "feat(admin): control broadcasts contacts and links"
```

### Task 5: Add durable delivery and webhook recovery controls

**Files:**
- Create: `src/lib/admin/operations/recovery-commands.ts`
- Create: `src/lib/admin/operations/recovery-commands.test.ts`
- Modify: `src/lib/automation/outbound-delivery.ts`
- Modify: `src/lib/automation/outbound-delivery.test.ts`
- Modify: `src/lib/automation/delivery-reconciliation.ts`
- Modify: `src/lib/automation/delivery-reconciliation.test.ts`
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/queue.test.ts`

**Interfaces:**
- Delivery actions: `retry`, `cancel_pending`, `release_stale_claim`.
- Webhook actions: `reprocess`.

- [x] **Step 1: Write failing idempotency and stale-claim tests**

```ts
it("does not retry a delivery with a provider receipt", async () => {
  repository.delivery = { status: "FAILED", providerMessageId: "mid-1" };
  await expect(commands.retryDelivery(actor, "d1", "operator retry")).rejects.toMatchObject({ code: "already_sent" });
  expect(queue.add).not.toHaveBeenCalled();
});

it("releases only claims older than the configured lease", async () => {
  clock.setSystemTime("2026-08-31T12:00:00Z");
  repository.delivery = { status: "PROCESSING", claimedAt: "2026-08-31T11:59:30Z" };
  await expect(commands.releaseStaleClaim(actor, "d1", "stuck job")).rejects.toMatchObject({ code: "claim_active" });
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/operations/recovery-commands.test.ts src/lib/automation/outbound-delivery.test.ts src/lib/automation/delivery-reconciliation.test.ts src/lib/queue.test.ts`

Expected: FAIL because owner recovery commands do not exist.

- [x] **Step 3: Implement state-machine-safe recovery**

Use conditional updates containing current state/version. Retry reuses the original outbound delivery ID and provider idempotency key. Cancel affects only pending/retryable records. Claim release requires an expired lease and returns the delivery to its prior retryable state. Webhook reprocessing verifies the stored event is valid and unsupported/poison events cannot be looped indefinitely; increment an admin reprocess counter and cap it.

- [x] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/operations/recovery-commands.test.ts src/lib/automation/outbound-delivery.test.ts src/lib/automation/delivery-reconciliation.test.ts src/lib/queue.test.ts && pnpm typecheck`

Expected: duplicate-send, active-lease, poison-event, and concurrent-command tests pass.

- [x] **Step 5: Commit**

```bash
git add src/lib/admin/operations/recovery-commands.ts src/lib/admin/operations/recovery-commands.test.ts src/lib/automation src/lib/queue.ts src/lib/queue.test.ts
git commit -m "feat(admin): add durable delivery recovery controls"
```

### Task 6: Build the operations command-center UI

**Files:**
- Create: `app/admin/operations/page.tsx`
- Create: `app/admin/operations/loading.tsx`
- Create: `app/admin/operations/error.tsx`
- Create: `src/components/admin/operations/operations-console.tsx`
- Create: `src/components/admin/operations/operations-console.test.tsx`
- Create: `src/components/admin/operations/operation-detail-drawer.tsx`
- Create: `src/components/admin/operations/operation-actions.tsx`
- Create: `src/components/admin/shared/cursor-table.tsx`
- Create: `src/components/admin/shared/filter-bar.tsx`
- Create: `src/components/admin/shared/reason-dialog.tsx`

- [x] **Step 1: Write failing interaction tests**

Cover keyboard-accessible tab switching, URL-synchronized filters, cursor navigation, empty/error/loading states, detail drawer focus return, explicit reason requirement, action-specific warnings, conflict refresh, and a successful audited command notification.

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/components/admin/operations/operations-console.test.tsx`

Expected: FAIL because the UI does not exist.

- [x] **Step 3: Implement the Linkar Volt operations console**

Use the existing admin shell and tokens: dense but readable table, seven operation tabs, workspace/status/provider/date filters, compact state badges, monospace IDs, and a right-side detail drawer. Keep every action inside a labeled menu/dialog; do not rely on color alone. Generate a UUID idempotency key per deliberate action and preserve it across transport retries.

- [x] **Step 4: Add safe live refresh**

Refresh only while the page is visible, pause during an open mutation dialog, preserve filters/cursor, announce changed result counts through a polite live region, and never apply an action to stale row state without server conflict checking.

- [x] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/components/admin/operations/operations-console.test.tsx && pnpm typecheck && pnpm lint`

Expected: interaction and accessibility tests pass.

- [x] **Step 6: Commit**

```bash
git add app/admin/operations src/components/admin/operations src/components/admin/shared
git commit -m "feat(admin): build operations command center"
```

### Task 7: Add integration health, drift, and repair services

**Files:**
- Create: `src/lib/admin/integrations/types.ts`
- Create: `src/lib/admin/integrations/repository.ts`
- Create: `src/lib/admin/integrations/service.ts`
- Create: `src/lib/admin/integrations/service.test.ts`
- Modify: `src/lib/meta/token-refresh.ts`
- Modify: `src/lib/meta/token-refresh.test.ts`
- Modify: `src/lib/meta/webhooks.ts`
- Modify: `src/lib/meta/webhooks.test.ts`
- Modify: `src/lib/facebook/webhooks.ts`
- Modify: `src/lib/facebook/webhooks.test.ts`

**Interfaces:**
- Returns derived connection health: provider, workspace, status, token expiry bucket, webhook/subscription drift, last success/error timestamps, and allowed actions.
- Integration actions: `refresh_token`, `mark_expired`, `repair_subscription`, `disconnect`.

- [x] **Step 1: Write failing redaction and repair tests**

```ts
it("returns token age without returning token material", async () => {
  const result = await service.getConnection("meta", "connection-1");
  expect(result).toMatchObject({ tokenExpiry: "within_7_days" });
  expect(JSON.stringify(result)).not.toMatch(/accessToken|refreshToken|encrypted/);
});

it("repairs only subscriptions missing from the provider", async () => {
  provider.listSubscriptions.mockResolvedValue(["messages"]);
  await service.repairSubscription(actor, "facebook", "connection-1", "restore drift");
  expect(provider.subscribe).toHaveBeenCalledWith(expect.arrayContaining(["feed"]));
  expect(provider.unsubscribe).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/integrations/service.test.ts src/lib/meta/token-refresh.test.ts src/lib/meta/webhooks.test.ts src/lib/facebook/webhooks.test.ts`

Expected: FAIL because admin integration orchestration is missing.

- [x] **Step 3: Implement health derivation and commands**

Read encrypted credentials only inside existing provider clients. Token refresh uses provider-supported refresh/exchange semantics, stores the replacement atomically, and redacts errors. Mark-expired is a local reversible status command. Subscription repair first reads provider state and applies only the missing expected fields. Disconnect calls existing deauthorization cleanup and is challenge-protected.

- [x] **Step 4: Handle provider failure safely**

Map provider timeouts/rate limits to retryable `503` responses with no automatic UI loop. Preserve the previous usable credential if refresh fails. Audit requested action and summarized outcome without storing response bodies.

- [x] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/integrations src/lib/meta src/lib/facebook && pnpm typecheck`

Expected: refresh, expiry, drift, repair, disconnect, error mapping, and redaction tests pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/admin/integrations src/lib/meta src/lib/facebook
git commit -m "feat(admin): add integration health and repair controls"
```

### Task 8: Build the integrations UI and workspace linkage

**Files:**
- Create: `app/api/admin/integrations/route.ts`
- Create: `app/api/admin/integrations/route.test.ts`
- Create: `app/api/admin/integrations/[provider]/[id]/route.ts`
- Create: `app/api/admin/integrations/[provider]/[id]/route.test.ts`
- Create: `app/admin/integrations/page.tsx`
- Create: `app/admin/integrations/loading.tsx`
- Create: `src/components/admin/integrations/integrations-console.tsx`
- Create: `src/components/admin/integrations/integrations-console.test.tsx`
- Modify: `app/admin/workspaces/[workspaceId]/page.tsx`
- Modify: `src/components/admin/workspace-detail-screen.tsx`

- [x] **Step 1: Write failing route and UI tests**

Test provider/status/expiry/drift filters, secret redaction at the JSON boundary, detail health history, workspace deep links, reason dialogs, refresh/repair confirmations, and challenge-protected disconnect.

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run app/api/admin/integrations src/components/admin/integrations/integrations-console.test.tsx src/components/admin/workspaces`

Expected: FAIL because integration routes and UI do not exist.

- [x] **Step 3: Implement guarded routes and command UI**

Use the same authorization, idempotency, reason, challenge, audit, pagination, filter, and error contracts as operations. Display derived health, expiry window, drift, last activity, and workspace owner—not credentials. Add an Integrations section to workspace detail with deep links into the filtered console.

- [x] **Step 4: Verify GREEN**

Run: `pnpm vitest run app/api/admin/integrations src/components/admin/integrations src/components/admin/workspaces && pnpm typecheck && pnpm lint`

Expected: route, redaction, interaction, and linkage tests pass.

- [x] **Step 5: Commit**

```bash
git add app/api/admin/integrations app/admin/integrations src/components/admin/integrations app/admin/workspaces src/components/admin/workspaces
git commit -m "feat(admin): build integrations command center"
```

## Phase Completion Gate

- [x] Run: `pnpm prisma validate && pnpm vitest run src/lib/admin/operations src/lib/admin/integrations app/api/admin/operations app/api/admin/integrations src/components/admin/operations src/components/admin/integrations`
- [x] Run: `pnpm test`
- [x] Run: `pnpm typecheck`
- [x] Run: `pnpm lint`
- [x] Confirm no admin DTO or audit fixture contains credentials, raw provider payloads, or message bodies.
- [x] Confirm delivery/webhook retry tests prove one logical provider send under concurrent replay.
- [x] Confirm every write route rejects non-owner and AAL1 identities and requires reason plus idempotency.
- [x] Confirm owner workspace resources cannot be selected by bulk actions.
- [x] Mark every completed checkbox in this file before starting the system/deletion phase.
