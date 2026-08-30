# Platform Admin System, Deletion, and Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents; execute inline.

**Goal:** Complete the owner console with truthful system/queue controls, challenge-protected permanent deletion, compliance-request operations, immutable audit inspection/export, production configuration, and end-to-end verification.

**Architecture:** System visibility is derived from bounded database/Redis/BullMQ probes and exposed through owner-only DTOs, never raw infrastructure consoles. Destructive deletion is an explicit, durable state machine: impact preview, typed confirmation plus AAL2 challenge, queued idempotent stages, cancellation before the irreversible boundary, and Supabase Auth hard deletion only after tenant data cleanup succeeds. Audit events remain append-only and are listed/exported through safe cursor queries.

**Tech Stack:** Next.js 16.3.1, React 19.2.8, TypeScript 5.9.3, Prisma 6.19.3, PostgreSQL, Supabase Auth Admin API, BullMQ 6.1.2, Redis, Zod 4.4.3, Vitest 4.1.11, Playwright/browser verification.

**Spec:** `docs/superpowers/specs/2026-08-31-platform-owner-admin-console-design.md`

## Global Constraints

- Execute only after the operations and integrations plan passes its completion gate.
- The console controls Linkar application state and queues only; it never displays or edits database URLs, Redis URLs, Supabase service-role keys, provider secrets, Cloudflare DNS, or deployment credentials.
- Permanent deletion is unavailable for allowlisted platform-owner UUIDs, the owner workspace, or an active workspace owner whose ownership has not been transferred or whose whole workspace is not being deleted.
- Typed confirmation, AAL2, reason, impact version, and a short-lived single-use challenge are all required server-side.
- `AdminDeletionJob` is cancelable only before `irreversibleAt`; terminal steps are idempotent and resumable.
- The Supabase `deleteUser` call is the final irreversible external step and is never used for suspension.
- Queue controls act on Linkar-owned named queues and explicit job IDs, not arbitrary Redis keys.
- Audit events are append-only, secret-redacted, cursor-paginated, and exported with CSV formula-injection protection.

---

### Task 1: Add truthful system health and queue snapshots

**Files:**
- Create: `src/lib/admin/system/types.ts`
- Create: `src/lib/admin/system/service.ts`
- Create: `src/lib/admin/system/service.test.ts`
- Modify: `src/lib/health.ts`
- Modify: `src/lib/health.test.ts`
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/queue.test.ts`
- Modify: `src/lib/worker-health.ts`
- Modify: `src/lib/worker-health.test.ts`

**Interfaces:**
- Produces `AdminSystemSnapshot { overall, generatedAt, release, web, database, redis, worker, queues, stuckClaims, webhookThroughput, deletionJobs, configurationPresence, reconciliation, rateLimits }`.
- Queue snapshots include only name, paused state, waiting/active/delayed/completed/failed counts, oldest waiting age, and last failed safe summary.
- Configuration presence exposes a fixed requirement name plus a boolean only; environment values and secret fingerprints are never returned.
- Each probe has a hard timeout and returns `healthy | degraded | unavailable` rather than throwing the entire response.

- [ ] **Step 1: Write failing degraded-probe and redaction tests**

```ts
it("returns a partial snapshot when Redis times out", async () => {
  probes.redis.mockRejectedValue(new TimeoutError());
  const result = await service.snapshot();
  expect(result).toMatchObject({ overall: "degraded", redis: { state: "unavailable" } });
  expect(result.database.state).toBe("healthy");
});

it("never returns connection strings or job payloads", async () => {
  const result = await service.snapshot();
  expect(JSON.stringify(result)).not.toMatch(/DATABASE_URL|REDIS_URL|service_role|jobData|accessToken/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/system/service.test.ts src/lib/health.test.ts src/lib/queue.test.ts src/lib/worker-health.test.ts`

Expected: FAIL because the bounded admin snapshot does not exist.

- [ ] **Step 3: Implement bounded probes and explicit projections**

Reuse the public health logic but collect components independently with timeouts. Use BullMQ `getJobCounts`, `isPaused`, and bounded failed-job queries. Sanitize failure names/codes into a fixed allowlist and truncate human-readable summaries; never serialize job data or stack traces.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/system/service.test.ts src/lib/health.test.ts src/lib/queue.test.ts src/lib/worker-health.test.ts && pnpm typecheck`

Expected: healthy, degraded, unavailable, timeout, and redaction tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/system src/lib/health.ts src/lib/health.test.ts src/lib/queue.ts src/lib/queue.test.ts src/lib/worker-health.ts src/lib/worker-health.test.ts
git commit -m "feat(admin): add bounded system health snapshots"
```

### Task 2: Add safe queue and reconciliation commands

**Files:**
- Create: `src/lib/admin/system/commands.ts`
- Create: `src/lib/admin/system/commands.test.ts`
- Create: `app/api/admin/system/route.ts`
- Create: `app/api/admin/system/route.test.ts`
- Create: `app/api/admin/system/queues/[queue]/route.ts`
- Create: `app/api/admin/system/queues/[queue]/route.test.ts`
- Modify: `src/lib/automation/delivery-reconciliation.ts`
- Modify: `src/lib/automation/delivery-reconciliation.test.ts`

**Interfaces:**
- Queue actions: `pause`, `resume`, `retry_failed_jobs` with an explicit maximum of 100 job IDs.
- System actions: `run_delivery_reconciliation`, `run_usage_reconciliation`.

- [ ] **Step 1: Write failing allowlist and audit tests**

```ts
it("rejects an unknown queue name", async () => {
  await expect(commands.pauseQueue(actor, "__proto__", "maintenance")).rejects.toMatchObject({ code: "unknown_queue" });
});

it("retries only the selected failed jobs", async () => {
  await commands.retryFailed(actor, "deliveries", ["j1", "j2"], "provider recovered");
  expect(queue.retry).toHaveBeenCalledTimes(2);
  expect(audit.write).toHaveBeenCalledWith(expect.objectContaining({ targetIds: ["j1", "j2"] }));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/system/commands.test.ts app/api/admin/system`

Expected: FAIL because system commands and routes do not exist.

- [ ] **Step 3: Implement guarded commands and routes**

Require owner AAL2, reason, and idempotency on every POST/PATCH. Pause/resume only queue names exported by the queue module. Retry checks every ID belongs to that queue and is currently failed, preserves job identity, and caps the batch. Reconciliation creates one deduplicated maintenance job instead of running a long scan inside the HTTP request.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/system/commands.test.ts app/api/admin/system src/lib/automation/delivery-reconciliation.test.ts && pnpm typecheck`

Expected: authorization, allowlist, cap, idempotency, queue-state, and audit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/system app/api/admin/system src/lib/automation/delivery-reconciliation.ts src/lib/automation/delivery-reconciliation.test.ts
git commit -m "feat(admin): add safe queue control commands"
```

### Task 3: Build the system command-center UI

**Files:**
- Create: `app/admin/system/page.tsx`
- Create: `app/admin/system/loading.tsx`
- Create: `app/admin/system/error.tsx`
- Create: `src/components/admin/system/system-console.tsx`
- Create: `src/components/admin/system/system-console.test.tsx`
- Create: `src/components/admin/system/queue-card.tsx`
- Create: `src/components/admin/system/reconciliation-panel.tsx`

- [ ] **Step 1: Write failing interaction and accessibility tests**

Cover partial outages, stale snapshot labeling, visibility-aware refresh, queue pause/resume reason dialogs, selected failed-job retry, reconciliation deduplication, keyboard navigation, and status text that does not rely on color.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/components/admin/system/system-console.test.tsx`

Expected: FAIL because the system console does not exist.

- [ ] **Step 3: Implement the real system view**

Use Linkar Volt cards for release/web, database, Redis, worker, queues, stuck claims, webhook throughput, deletion jobs, configuration presence, reconciliation, and rate-limit posture. Show snapshot timestamp and component-specific degraded messages. The console must say “Unavailable” when a probe fails and must not synthesize green state from HTTP success alone.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/components/admin/system/system-console.test.tsx && pnpm typecheck && pnpm lint`

Expected: data, interaction, and accessibility tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/admin/system src/components/admin/system
git commit -m "feat(admin): build system command center"
```

### Task 4: Persist deletion jobs and immutable impact snapshots

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260831150000_admin_deletion_jobs/migration.sql`
- Create: `src/lib/admin/deletion/types.ts`
- Create: `src/lib/admin/deletion/repository.ts`
- Create: `src/lib/admin/deletion/repository.test.ts`
- Create: `src/lib/admin/deletion/impact.ts`
- Create: `src/lib/admin/deletion/impact.test.ts`

**Interfaces:**
- Adds `AdminDeletionJob` with target kind/id, state, impact JSON/version/digest, requestedBy, reason, timestamps, current stage, progress, attempts, cancellation fields, `irreversibleAt`, and terminal error code.
- Adds `AdminDeletionStage` rows keyed by `(jobId, stage)` for resumability.
- Produces `previewDeletion(target): DeletionImpact` and stable SHA-256 `impactDigest`.

- [ ] **Step 1: Write failing impact and protection tests**

```ts
it("counts every workspace-owned resource in a stable impact snapshot", async () => {
  expect(await impact.previewWorkspace("w1")).toEqual(expect.objectContaining({
    version: 1,
    counts: expect.objectContaining({ automations: 2, contacts: 12, deliveries: 40, integrations: 1 }),
  }));
});

it.each(["platform-owner-user", "platform-owner-workspace"])("refuses deletion of %s", async (target) => {
  await expect(impact.preview(targetFixture(target))).rejects.toMatchObject({ code: "protected_target" });
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/deletion/impact.test.ts src/lib/admin/deletion/repository.test.ts`

Expected: FAIL because deletion jobs and impact services do not exist.

- [ ] **Step 3: Add normalized schema and migration**

Use enums for target kind, job state, and stage state; store only a validated JSON impact snapshot. Add foreign-key indexes, unique active-job constraint per target, and RLS with no public policies. Add database constraints that terminal jobs have `finishedAt` and an append-only trigger for completed stage records.

- [ ] **Step 4: Implement stable impact calculation**

Use one repeatable-read transaction for counts and identifiers, protect platform-owner targets by UUID, flag workspace ownership/integration/data-deletion dependencies, canonicalize JSON keys, and hash the canonical representation. Do not include message content, tokens, or provider payloads.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/admin/deletion/impact.test.ts src/lib/admin/deletion/repository.test.ts`

Expected: migration, protection, consistency, digest, concurrency, and RLS checks pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260831150000_admin_deletion_jobs/migration.sql src/lib/admin/deletion
git commit -m "feat(admin): add durable deletion jobs"
```

### Task 5: Implement challenge-protected deletion request and cancellation APIs

**Files:**
- Create: `src/lib/admin/deletion/service.ts`
- Create: `src/lib/admin/deletion/service.test.ts`
- Create: `app/api/admin/deletions/preview/route.ts`
- Create: `app/api/admin/deletions/preview/route.test.ts`
- Create: `app/api/admin/deletions/route.ts`
- Create: `app/api/admin/deletions/route.test.ts`
- Create: `app/api/admin/deletions/[id]/route.ts`
- Create: `app/api/admin/deletions/[id]/route.test.ts`

**Interfaces:**
- Preview returns impact, `impactDigest`, exact `confirmationPhrase`, and challenge metadata.
- Create accepts target, exact phrase, impact digest, challenge, reason, and idempotency key.
- Cancel succeeds only for queued/running jobs before `irreversibleAt` and before the irreversible stage starts.

- [ ] **Step 1: Write failing confirmation and stale-impact tests**

```ts
it("rejects a stale impact preview", async () => {
  impact.previewWorkspace.mockResolvedValue({ ...changedImpact, digest: "new-digest" });
  const response = await POST(request({ impactDigest: "old-digest", confirmation: "DELETE WORKSPACE acme" }));
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: "impact_changed" });
});

it("consumes a deletion challenge only once", async () => {
  expect((await POST(validRequest())).status).toBe(202);
  expect((await POST(validRequest({ idempotencyKey: "different" }))).status).toBe(403);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/deletion/service.test.ts app/api/admin/deletions`

Expected: FAIL because deletion routes do not exist.

- [ ] **Step 3: Implement exact server-side gates**

Require platform owner AAL2, nonempty reason, idempotency key, exact case-sensitive target-specific phrase, matching fresh digest, and single-use challenge bound to actor/target/digest. Recompute impact immediately before insertion. Insert the job and enqueue it transactionally via the existing durable job/outbox pattern.

- [ ] **Step 4: Implement safe cancellation and status**

Use optimistic state/version updates. Cancellation sets `cancelRequestedAt`; the worker observes it between stages. Return `409 irreversible` after the boundary and never imply a completed deletion was undone.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/deletion/service.test.ts app/api/admin/deletions && pnpm typecheck`

Expected: authorization, challenge, phrase, digest, idempotency, concurrent request, cancellation, and audit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/deletion app/api/admin/deletions
git commit -m "feat(admin): guard permanent deletion requests"
```

### Task 6: Implement the resumable deletion worker

**Files:**
- Create: `src/lib/admin/deletion/processor.ts`
- Create: `src/lib/admin/deletion/processor.test.ts`
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/queue.deletion.test.ts`
- Modify: `src/worker.ts`

**Interfaces:**
- User stages: validate target, detach/cancel app work, delete app membership/control data, mark irreversible, delete Supabase Auth user, finalize.
- Workspace stages: validate target, pause/cancel work, disconnect providers, delete tenant data in dependency order, mark irreversible, delete remaining Auth users only when explicitly included, finalize.

- [ ] **Step 1: Write failing resumability and irreversible-boundary tests**

```ts
it("resumes after the last completed stage without repeating provider disconnect", async () => {
  repository.completedStages = ["VALIDATE", "CANCEL_WORK", "DISCONNECT_PROVIDERS"];
  await processor.run("job-1");
  expect(providers.disconnectAll).not.toHaveBeenCalled();
  expect(repository.deleteTenantData).toHaveBeenCalledOnce();
});

it("calls Supabase hard delete only after local cleanup is committed", async () => {
  await processor.run("job-1");
  expect(callOrder(repository.markIrreversible, supabase.auth.admin.deleteUser)).toEqual("before");
  expect(repository.hasTargetData).toHaveResolvedTo(false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/deletion/processor.test.ts src/lib/queue.deletion.test.ts`

Expected: FAIL because the processor does not exist.

- [ ] **Step 3: Implement idempotent stage execution**

Claim a job with a lease and version, skip completed stages, write stage start/finish atomically, check cancellation between reversible stages, and retry only classified transient failures with bounded exponential backoff. Provider disconnect failure is recorded and retried before tenant deletion; it is not silently ignored.

- [ ] **Step 4: Implement explicit dependency cleanup**

Use Prisma transactions bounded by table groups, relying on known foreign keys and explicit deletes rather than raw schema-wide SQL. Cancel queued work before deleting its records. For user deletion, refuse if the membership is the last owner unless the enclosing workspace job owns the transition. Call `deleteUser(userId, false)` only in the terminal Auth stage.

- [ ] **Step 5: Implement terminal failure and operator retry**

Persist safe error codes and stage; never persist tokens or full provider errors. An owner retry resumes the same job ID after a reasoned, audited command. Jobs past the irreversible boundary cannot be canceled but can be resumed to completion.

- [ ] **Step 6: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/deletion/processor.test.ts src/lib/queue.deletion.test.ts src/lib/meta/deauthorization.test.ts src/lib/facebook/deauthorization.test.ts && pnpm typecheck`

Expected: cancel, retry, crash-resume, duplicate-job, provider-failure, protected-owner, and terminal Auth deletion tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/admin/deletion src/lib/queue.ts src/lib/queue.deletion.test.ts src/worker.ts
git commit -m "feat(admin): process permanent deletions safely"
```

### Task 7: Build deletion jobs and compliance-request operations

**Files:**
- Create: `app/admin/deletions/page.tsx`
- Create: `app/admin/deletions/loading.tsx`
- Create: `src/components/admin/deletions/deletion-console.tsx`
- Create: `src/components/admin/deletions/deletion-console.test.tsx`
- Create: `src/components/admin/deletions/deletion-wizard.tsx`
- Create: `src/lib/admin/compliance/repository.ts`
- Create: `src/lib/admin/compliance/repository.test.ts`
- Create: `app/api/admin/compliance/data-deletions/route.ts`
- Create: `app/api/admin/compliance/data-deletions/route.test.ts`
- Create: `app/admin/system/data-deletions/page.tsx`

- [ ] **Step 1: Write failing UI and compliance tests**

Cover impact preview counts, changed-impact refresh, exact phrase mismatch, challenge expiration, progress stages, cancel-before-boundary, retry-after-failure, protected target messaging, and cross-provider `DataDeletionRequest` list/status filters without exposing confirmation codes.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/components/admin/deletions app/api/admin/compliance src/lib/admin/compliance`

Expected: FAIL because deletion and compliance consoles do not exist.

- [ ] **Step 3: Implement the deletion wizard**

Show target identity, ownership warnings, complete impact counts, exact phrase, reason, MFA/challenge state, and an irreversible warning. Fetch a new preview when digest conflicts. Use a generated idempotency key and never place challenge/confirmation material in the URL.

- [ ] **Step 4: Implement compliance request visibility**

List Meta/Facebook deletion requests with provider, status, requested/completed timestamps, safe error code, and workspace linkage. Owner actions are limited to safe retry/reconciliation of existing deletion processing; public confirmation codes and raw signed requests remain hidden.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/components/admin/deletions app/api/admin/compliance src/lib/admin/compliance && pnpm typecheck && pnpm lint`

Expected: deletion wizard, progress, safe controls, compliance filters, and redaction tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/admin/deletions app/admin/system/data-deletions app/api/admin/compliance src/components/admin/deletions src/lib/admin/compliance
git commit -m "feat(admin): build deletion and compliance consoles"
```

### Task 8: Complete immutable audit browsing and export

**Files:**
- Create: `src/lib/admin/audit/repository.ts`
- Create: `src/lib/admin/audit/repository.test.ts`
- Create: `src/lib/admin/audit/export.ts`
- Create: `src/lib/admin/audit/export.test.ts`
- Create: `app/api/admin/audit/route.ts`
- Create: `app/api/admin/audit/route.test.ts`
- Create: `app/api/admin/audit/export/route.ts`
- Create: `app/api/admin/audit/export/route.test.ts`
- Create: `app/admin/audit/page.tsx`
- Create: `app/admin/audit/loading.tsx`
- Create: `src/components/admin/audit/audit-console.tsx`
- Create: `src/components/admin/audit/audit-console.test.tsx`

**Interfaces:**
- Filters: actor, action, target kind/id, workspace, request ID, result, origin, and date range.
- Cursor order: `(createdAt DESC, id DESC)`.
- CSV fields are a fixed safe projection and never include unrestricted metadata JSON.

- [ ] **Step 1: Write failing immutability, filter, and CSV tests**

```ts
it("rejects update and delete attempts at the database boundary", async () => {
  await expect(prisma.adminAuditEvent.update({ where: { id: "audit-1" }, data: { reason: "changed" } })).rejects.toThrow();
  await expect(prisma.adminAuditEvent.delete({ where: { id: "audit-1" } })).rejects.toThrow();
});

it("escapes spreadsheet formulas in exported cells", () => {
  expect(csvCell("=HYPERLINK(\"https://evil\")")).toBe("'=HYPERLINK(\"https://evil\")");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/audit app/api/admin/audit`

Expected: FAIL because list/export modules do not exist or the trigger is incomplete.

- [ ] **Step 3: Implement explicit audit queries and bounded export**

Select fixed columns, validate filters, reuse opaque cursor helpers, and cap synchronous exports at 10,000 rows/date range. Stream CSV with UTF-8 BOM only if current project conventions require it, CRLF rows, fixed headers, formula escaping, and a timestamped filename. Record an `audit.exported` event containing filters and row count, not the exported contents.

- [ ] **Step 4: Implement the audit console**

Use a dense timeline/table with actor, action, target, workspace, result, origin, timestamp, and expandable redacted summaries. Synchronize filters to the URL, preserve cursor navigation, and make export a reasoned owner action.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/audit app/api/admin/audit src/components/admin/audit && pnpm typecheck && pnpm lint`

Expected: immutable storage, filters, pagination, export cap, escaping, audit-of-export, and UI tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/admin/audit app/api/admin/audit app/admin/audit src/components/admin/audit prisma/migrations
git commit -m "feat(admin): complete immutable audit console"
```

### Task 9: Finish owner navigation, loading states, and route protection

**Files:**
- Modify: `src/components/admin/admin-shell.tsx`
- Modify: `src/components/admin/admin-shell.test.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `proxy.ts`
- Modify: `proxy.test.ts`
- Create: `app/admin/loading.tsx`
- Create: `app/admin/not-found.tsx`
- Modify: all `app/admin/**/loading.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write failing navigation and unauthorized-discovery tests**

Test every required destination, exact active state, responsive rail/drawer behavior, admin link visibility only for allowlisted owners, inaccessible admin routes returning non-disclosing responses, skeletons matching final layout, focus management, reduced motion, and 200% zoom without horizontal page overflow.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/components/admin/admin-shell.test.tsx src/components/app-shell.test.tsx proxy.test.ts`

Expected: FAIL until all final routes and responsive states are wired.

- [ ] **Step 3: Complete the Linkar Operator shell**

Keep the approved navigation exactly Overview, Workspaces, Users, Plans, Operations, Integrations, System, Audit, and Security; link data-deletion requests from System rather than adding a new primary destination. Use the yellow operator rail and the app's typography/tokens. Keep mobile actions reachable from a labeled drawer and preserve app keyboard/focus conventions.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/components/admin src/components/app-shell.test.tsx proxy.test.ts && pnpm typecheck && pnpm lint`

Expected: navigation, protection, responsive, skeleton, and accessibility tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin src/components/app-shell.tsx src/components/app-shell.test.tsx proxy.ts proxy.test.ts app/admin app/globals.css
git commit -m "feat(admin): finish owner console navigation"
```

### Task 10: Add production configuration and operator documentation

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `docker-compose.coolify.yml`
- Modify: `README.md`
- Create: `docs/admin-console-operations.md`
- Create: `docs/admin-console-deletion-runbook.md`

- [ ] **Step 1: Write failing environment validation tests**

Require a production `PLATFORM_OWNER_USER_IDS` UUID allowlist, admin challenge TTL, deletion lease/retry configuration, and named-queue allowlist defaults. Reject emails, empty production allowlists, malformed UUIDs, and owner IDs duplicated with whitespace/case artifacts.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/env.test.ts`

Expected: FAIL because final production variables are not validated/documented.

- [ ] **Step 3: Wire environment and compose configuration**

Declare non-secret owner UUID/config variables for web and worker where required. Keep secrets referenced through deployment environment interpolation; never commit values. Preserve existing worker healthcheck and `WORKER_HEALTH_PORT`. Add no browser-exposed `NEXT_PUBLIC_` owner/security variables.

- [ ] **Step 4: Write operator runbooks**

Document owner UUID enrollment, MFA bootstrap/recovery, suspension vs permanent deletion, deletion stages/cancellation boundary, queue pause/retry/reconciliation, audit export, secret rotation, incident recovery, and a production smoke-test checklist. State clearly that DNS/deployment/database administration remains in Cloudflare/Coolify/Supabase, outside the Linkar app.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/lib/env.test.ts && pnpm typecheck && pnpm lint`

Expected: configuration tests pass and tracked files contain no real credentials.

- [ ] **Step 6: Commit**

```bash
git add .env.example src/lib/env.ts src/lib/env.test.ts docker-compose.coolify.yml README.md docs/admin-console-operations.md docs/admin-console-deletion-runbook.md
git commit -m "docs(admin): add production operator runbooks"
```

### Task 11: Run end-to-end security, browser, and release verification

**Files:**
- Create: `tests/e2e/admin-console.spec.ts`
- Create: `tests/e2e/admin-destructive-actions.spec.ts`
- Modify: `playwright.config.ts`
- Modify: plan checkboxes in all four platform admin plan files

- [ ] **Step 1: Add end-to-end scenarios with seeded isolated data**

Cover anonymous/member/AAL1 rejection; owner MFA enrollment; AAL2 access; workspace/user suspension and restoration; plan quota enforcement; automation edit/version restore; integration health; queue pause/resume; audit visibility; deletion preview/cancel; and a test-only disposable user deletion that proves terminal Auth removal. Never run destructive E2E against production.

- [ ] **Step 2: Run targeted E2E and fix only observed failures**

Run: `pnpm exec playwright test tests/e2e/admin-console.spec.ts tests/e2e/admin-destructive-actions.spec.ts`

Expected: all owner-console journeys pass against the isolated test environment.

- [ ] **Step 3: Perform manual browser verification**

At desktop and mobile widths, inspect every admin page, loading/error/empty state, keyboard navigation, dialogs/drawers, 200% zoom, reduced motion, stale/conflict responses, and network responses for secret leakage. Capture evidence for the release notes; do not expose test credentials.

- [ ] **Step 4: Run the full release gate**

Run: `pnpm prisma validate`

Run: `pnpm test`

Run: `pnpm typecheck`

Run: `pnpm lint`

Run: `pnpm build`

Run: `git diff --check`

Expected: every command exits zero.

- [ ] **Step 5: Run database safety checks against the staging migration target**

Apply migrations to staging, verify RLS is enabled with no public policies for admin tables, check all new foreign keys have supporting indexes, confirm the audit trigger rejects UPDATE/DELETE, run Supabase database advisors, and exercise deletion only with disposable seeded records.

- [ ] **Step 6: Run the production-readiness acceptance checklist**

Confirm exact UUID allowlist, owner AAL2, no owner-by-email fallback, no secret-bearing DTO/log/audit/export, explicit reasons and idempotency on writes, protected owner targets, suspension at HTTP/worker boundaries, real plan enforcement, one logical send under retry, deletion cancellation boundary, terminal Supabase Auth deletion, truthful health probes, and all app routes using `app.linkar.in` while public/legal pages remain on `linkar.in` as intended.

- [ ] **Step 7: Commit final verification assets**

```bash
git add tests/e2e playwright.config.ts docs/superpowers/plans/2026-08-31-platform-admin-*.md
git commit -m "test(admin): verify owner console end to end"
```

## Final Completion Gate

- [ ] Every checkbox in all four implementation plans is complete.
- [ ] Every requested module contains real data and working writes; there are no placeholder cards, demo metrics, TODO actions, or client-only authorization checks.
- [ ] All owner writes are AAL2-gated, reasoned, idempotent, conflict-safe, and audited.
- [ ] Permanent deletion is protected, resumable, cancelable before the boundary, and tested only on disposable non-owner data.
- [ ] Full unit/integration/E2E, typecheck, lint, build, Prisma, migration, RLS, and browser gates pass with recorded command evidence.
- [ ] No secrets or user message bodies are present in source, logs, audit events, exports, snapshots, or final handoff output.
