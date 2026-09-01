# Automation Delivery Latency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce webhook-to-provider latency while preserving validation, suspension checks, idempotency, quotas, and message ordering.

**Architecture:** Signed webhook events enter the realtime queue without database prefiltering, realtime jobs receive explicit priority, and the worker remains the authoritative authorization boundary. The runner replaces broad/N+1 reads with targeted and batched repository operations, while outbound ledger claiming and monthly usage reservation become one short database transaction executed before the provider call. Provider calls receive a bounded deadline and worker logs expose queue, internal, provider, and total durations.

**Tech Stack:** Next.js 16.3 route handlers, TypeScript 5.9, BullMQ 6, Prisma 6.19, PostgreSQL/Supabase transaction pooler, Vitest 4, Node.js 24.

**Spec:** `docs/superpowers/specs/2026-09-01-automation-delivery-latency-design.md`

## Global Constraints

- Keep HMAC signature verification, JSON parsing, and webhook normalization before enqueue.
- Keep connected-channel and `Workspace.status === "ACTIVE"` checks in the worker runner before evaluation or delivery.
- Keep deterministic job IDs, existing retry counts/backoff, and ordered action delivery.
- Keep provider calls outside database transactions.
- Treat provider timeouts as ambiguous `UNKNOWN` results; never blindly retry them.
- Never log tokens, payloads, message text, recipient IDs, email addresses, or raw provider responses.
- Use the existing Supabase transaction-pooler-safe Prisma connection; do not add prepared statements or session state.

---

### Task 1: Fast webhook ingress and realtime queue priority

**Files:**
- Modify: `src/lib/queue.ts`
- Modify: `app/api/meta/webhook/route.ts`
- Modify: `app/api/facebook/webhook/route.ts`
- Modify: `app/api/meta/webhook/route.test.ts`
- Modify: `app/api/facebook/webhook/route.test.ts`
- Modify: `src/lib/queue.test.ts`

**Interfaces:**
- Produces: `QUEUE_PRIORITY` with numeric `REALTIME`, `INTERACTIVE`, `BULK`, and `MAINTENANCE` values.
- Produces: `QueuedInstagramEvent` and `QueuedFacebookEvent`, each adding `linkarIngestedAt: number` without moving existing event fields.
- Preserves: `enqueueWebhookEvents(events): Promise<number>` and `enqueueFacebookEvents(events): Promise<number>`.

- [ ] **Step 1: Write failing webhook-route tests**

Update both route suites so queue acceptance is tested without repository calls:

```ts
it("enqueues every signed normalized event without database prefiltering", async () => {
  mocks.enqueueWebhookEvents.mockResolvedValue(1);
  const response = await POST(new Request("http://localhost/api/meta/webhook", { method: "POST", body: "{}" }));
  expect(response.status).toBe(200);
  expect(mocks.enqueueWebhookEvents).toHaveBeenCalledWith([expect.objectContaining({ id: "event_1" })]);
  expect(mocks.findWorkspaceByInstagramAccount).not.toHaveBeenCalled();
  expect(mocks.getWorkspaceStatus).not.toHaveBeenCalled();
  expect(mocks.processNormalizedEvent).not.toHaveBeenCalled();
});
```

Keep the inline fallback tests, but make the mocked runner responsible for inactive/unknown workspace outcomes.

- [ ] **Step 2: Run route tests and verify failure**

Run: `pnpm vitest run app/api/meta/webhook/route.test.ts app/api/facebook/webhook/route.test.ts`

Expected: FAIL because both routes still call mapping/status methods before enqueueing.

- [ ] **Step 3: Remove prequeue database filtering**

In each `POST`, enqueue `events` directly. Resolve `getRepository()` only inside the `enqueued === 0 && events.length > 0` fallback:

```ts
const events = normalizeWebhook(payload);
const enqueued = await enqueueWebhookEvents(events);
if (events.length > 0 && enqueued === 0) {
  const repository = getRepository();
  for (const event of events) {
    await processNormalizedEvent(event, repository, runnerOptions);
  }
}
```

- [ ] **Step 4: Write failing priority tests**

Mock BullMQ `Queue.add` and assert the relevant options:

```ts
expect(add).toHaveBeenCalledWith(
  "instagram-event",
  expect.objectContaining({ linkarIngestedAt: expect.any(Number), accountId: "ig_1" }),
  expect.objectContaining({ priority: QUEUE_PRIORITY.REALTIME }),
);
```

Cover Facebook realtime, follow-up interactive, broadcast/lead bulk, and maintenance/deletion priority tiers.

- [ ] **Step 5: Implement queue priority and ingestion metadata**

Add:

```ts
export const QUEUE_PRIORITY = {
  REALTIME: 1,
  INTERACTIVE: 5,
  BULK: 10,
  MAINTENANCE: 20,
} as const;

export type QueuedInstagramEvent = NormalizedEvent & { linkarIngestedAt: number };
export type QueuedFacebookEvent = FacebookNormalizedEvent & { linkarIngestedAt: number };
```

Spread events into new queued payloads and add explicit priority to every queue job type so BullMQ's default priority cannot jump ahead of realtime work.

- [ ] **Step 6: Run focused tests**

Run: `pnpm vitest run app/api/meta/webhook/route.test.ts app/api/facebook/webhook/route.test.ts src/lib/queue.test.ts src/lib/queue.broadcast.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api/meta/webhook app/api/facebook/webhook src/lib/queue.ts src/lib/queue.test.ts src/lib/queue.broadcast.test.ts
git commit -m "perf(queue): prioritize realtime webhook delivery"
```

### Task 2: Targeted runner reads and batched skipped outcomes

**Files:**
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/automation/runner.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `src/lib/automation/runner.test.ts`
- Modify: `src/lib/automation/conversation-triggers.test.ts`

**Interfaces:**
- Produces: `listActiveAutomationsForInstagramAccount(workspaceId, instagramAccountId): Promise<AutomationRecord[]>`.
- Produces: `hasPausedParticipant(workspaceId, instagramAccountId, igScopedUserId): Promise<boolean>`.
- Produces: `recordExecutions(inputs: RecordExecutionInput[]): Promise<number>` using one batch insert and duplicate skipping.
- Preserves: all existing public runner result and automation-matching semantics.

- [ ] **Step 1: Write failing repository contract tests**

Seed active/draft, Instagram/Facebook, pinned/unpinned automations and paused participants, then assert:

```ts
expect((await repository.listActiveAutomationsForInstagramAccount("workspace_a", "ig_1")).map((item) => item.id))
  .toEqual(["high_priority", "unpinned"]);
expect(await repository.hasPausedParticipant("workspace_a", "ig_1", "person_1")).toBe(true);
expect(await repository.hasPausedParticipant("workspace_a", "ig_1", "person_2")).toBe(false);
expect(await repository.recordExecutions([skipOne, skipOne, skipTwo])).toBe(2);
```

- [ ] **Step 2: Run repository tests and verify failure**

Run: `pnpm vitest run src/lib/repository.test.ts`

Expected: FAIL because the three repository methods do not exist.

- [ ] **Step 3: Implement memory and Prisma repository methods**

Use this Prisma filter and ordering:

```ts
client.automation.findMany({
  where: {
    workspaceId,
    status: "ACTIVE",
    provider: "INSTAGRAM",
    OR: [{ instagramAccountId: null }, { instagramAccountId }],
  },
  orderBy: [{ priority: "desc" }, { name: "asc" }, { id: "asc" }],
});
```

Use `findFirst({ select: { id: true } })` for the exact paused sender and `createMany({ data, skipDuplicates: true })` for batched outcomes. Mirror the same semantics in memory.

- [ ] **Step 4: Write failing runner call-count and ordering tests**

Spy on a memory repository and assert:

```ts
expect(repository.listActiveAutomationsForInstagramAccount).toHaveBeenCalledTimes(1);
expect(repository.listAutomations).not.toHaveBeenCalled();
expect(repository.hasPausedParticipant).toHaveBeenCalledWith("workspace_a", "ig_1", "person_1");
expect(repository.hasExecution).not.toHaveBeenCalled();
expect(repository.recordExecutions).toHaveBeenCalledTimes(1);
expect(client.sendDirectMessage.mock.invocationCallOrder[0])
  .toBeLessThan(repository.recordExecutions.mock.invocationCallOrder[0]);
```

Add a conversational-capture test proving `getContact` is called once for a DM event.

- [ ] **Step 5: Refactor the Instagram runner**

Load targeted automations, load the contact once, and pass it into opt-out/capture helpers. Replace the broad paused list with `hasPausedParticipant`.

Evaluate each v1 automation before persistence. For unmatched results, append a `RecordExecutionInput` to `skippedExecutions`. For matched results, call `claimExecution` immediately and use `completeExecution` for reply-once, demo, key-missing, daily-limit, sent, and failed outcomes. Flush unmatched results using one `recordExecutions` call after provider-critical work.

Start activity persistence without awaiting it before provider delivery:

```ts
void repository.recordWebhookEvent(mapping.workspaceId, activity)
  .catch((error) => logger.warn("Failed to persist webhook activity", {
    eventId: event.id,
    error: error instanceof Error ? error.message : String(error),
  }));
```

- [ ] **Step 6: Run focused runner and repository tests**

Run: `pnpm vitest run src/lib/repository.test.ts src/lib/automation/runner.test.ts src/lib/automation/conversation-triggers.test.ts src/lib/automation/field-collection.test.ts src/lib/automation/account-scoping.test.ts`

Expected: PASS with unchanged delivery results and fewer repository calls.

- [ ] **Step 7: Commit**

```bash
git add src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/repository.test.ts src/lib/automation/runner.ts src/lib/automation/*.test.ts
git commit -m "perf(automation): reduce runner database round trips"
```

### Task 3: Atomic outbound claim and monthly usage reservation

**Files:**
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/automation/outbound-delivery.ts`
- Modify: `src/lib/entitlements/service.ts`
- Modify: `src/lib/automation/outbound-delivery.test.ts`
- Modify: `src/lib/automation/delivery-repository-concurrency.test.ts`
- Modify: `src/lib/entitlements/service.test.ts`

**Interfaces:**
- Produces: `PrepareOutboundDeliveryInput = EnsureOutboundDeliveryInput & { owner: string; leaseUntil: string; periodStart: string; monthlyLimit: number | null }`.
- Produces: `prepareOutboundDelivery(input): Promise<{ status: "CLAIMED"; record: OutboundDeliveryRecord } | { status: "TERMINAL"; record: OutboundDeliveryRecord } | { status: "BUSY"; record: OutboundDeliveryRecord } | { status: "QUOTA_REJECTED"; record: OutboundDeliveryRecord }>`.
- Produces: `releaseOutboundDeliveryReservation(deliveryKey): Promise<boolean>`.
- Produces: `getMonthlyDeliveryLimit(workspaceId): Promise<number | null>` with a 30-second process-local cache.

- [ ] **Step 1: Write failing preparation state tests**

Cover fresh claim, reused `SENT`, `UNKNOWN`, permanent `FAILED`, active `CLAIMED`, retryable `FAILED`, and quota rejection. Assert fresh and retryable claims reserve usage once and reused terminal/busy results do not.

- [ ] **Step 2: Write failing concurrency test**

Run two preparations for the same delivery key concurrently:

```ts
const results = await Promise.all([
  repository.prepareOutboundDelivery(input),
  repository.prepareOutboundDelivery({ ...input, owner: "owner_2" }),
]);
expect(results.filter((result) => result.status === "CLAIMED")).toHaveLength(1);
expect(results.filter((result) => result.status === "BUSY")).toHaveLength(1);
expect(await usageFor("workspace_a", periodStart)).toBe(1);
```

- [ ] **Step 3: Run outbound tests and verify failure**

Run: `pnpm vitest run src/lib/automation/outbound-delivery.test.ts src/lib/automation/delivery-repository-concurrency.test.ts src/lib/entitlements/service.test.ts`

Expected: FAIL because preparation and cached-limit APIs do not exist.

- [ ] **Step 4: Implement the memory preparation contract**

Use the existing in-memory delivery map plus reservation maps. Claim only `PENDING` or retryable `FAILED`, return terminal/busy states unchanged, enforce `monthlyLimit`, and make reservation release decrement usage exactly once.

- [ ] **Step 5: Implement the Prisma short transaction**

Inside one `client.$transaction`:

1. `upsert` the ledger by `deliveryKey` with an empty update.
2. Return terminal states immediately.
3. Use `updateManyAndReturn` with the claimable state predicate to acquire ownership.
4. Upsert `WorkspaceUsagePeriod`.
5. Insert `WorkspaceUsageReservation` with `ON CONFLICT DO NOTHING RETURNING "deliveryKey"`.
6. Only for a new reservation, atomically increment `deliveriesReserved` with `deliveriesReserved < monthlyLimit` when a limit exists.
7. If the limit update matches zero rows, delete the reservation and mark the owned delivery `FAILED/SUPPRESSED` before commit.

All preparation transactions acquire the delivery row before the workspace usage row, keeping lock order consistent. No HTTP call occurs inside the transaction.

- [ ] **Step 6: Cache only entitlement configuration**

Add a 30-second cache to the production entitlement service:

```ts
type CacheEntry = { expiresAt: number; value: EffectiveEntitlements };
const cache = new Map<string, CacheEntry>();

async function getMonthlyDeliveryLimit(workspaceId: string) {
  return (await getEffectiveEntitlements(workspaceId)).monthlyDeliveryLimit;
}
```

Allow tests to inject `now` and `cacheTtlMs`. Do not cache usage counters or workspace lifecycle state.

- [ ] **Step 7: Route outbound execution through preparation**

Replace `ensureOutboundDelivery` + `claimOutboundDelivery` + `reserveMonthlyDelivery` with:

```ts
const monthlyLimit = await entitlementService.getMonthlyDeliveryLimit(request.workspaceId);
const preparation = await repository.prepareOutboundDelivery({
  ...deliveryInput,
  owner,
  leaseUntil,
  periodStart: currentPeriodStart(new Date()),
  monthlyLimit,
});
```

Map `TERMINAL`, `BUSY`, and `QUOTA_REJECTED` to the existing public `DeliveryExecutionResult`. On known provider rejection, call `releaseOutboundDeliveryReservation` before failing the ledger. Keep ambiguous results reserved.

- [ ] **Step 8: Run outbound, entitlement, reconciliation, broadcast, and runner tests**

Run: `pnpm vitest run src/lib/automation/outbound-delivery.test.ts src/lib/automation/delivery-repository-concurrency.test.ts src/lib/entitlements/service.test.ts src/lib/automation/delivery-reconciliation.test.ts src/lib/automation/broadcast-runner.test.ts src/lib/automation/runner.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/automation/outbound-delivery.ts src/lib/automation/*test.ts src/lib/entitlements
git commit -m "perf(delivery): atomically prepare outbound sends"
```

### Task 4: Provider request deadline and lease validation

**Files:**
- Modify: `src/lib/meta/client.ts`
- Modify: `src/lib/facebook/client.ts`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/meta/client.test.ts`
- Modify: `src/lib/facebook/client.test.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Modify: `docker-compose.production.yml`

**Interfaces:**
- Produces: `providerRequestTimeoutMs` in `ServerEnv`, default `10_000`.
- Extends: Meta/Facebook client options with `requestTimeoutMs?: number`, default `10_000`.
- Constraint: `DISPATCH_LEASE_MS >= PROVIDER_REQUEST_TIMEOUT_MS + 5_000`.

- [ ] **Step 1: Write failing timeout tests**

Inject a fetcher that waits for abort and assert:

```ts
const fetcher = vi.fn((_url, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
}));
await expect(client.sendDirectMessage(connection, "person", message))
  .rejects.toMatchObject({ responseReceived: false, retryable: true });
```

Use a 5 ms timeout in tests. Add env tests for the default and invalid lease/timeout relationship.

- [ ] **Step 2: Run client/env tests and verify failure**

Run: `pnpm vitest run src/lib/meta/client.test.ts src/lib/facebook/client.test.ts src/lib/env.test.ts`

Expected: FAIL because requests have no deadline and env has no timeout field.

- [ ] **Step 3: Implement provider abort deadlines**

Store `requestTimeoutMs` on each client and set:

```ts
signal: init.signal ?? AbortSignal.timeout(this.requestTimeoutMs),
```

Translate `AbortError` into the existing provider error type with status `0`, `responseReceived: false`, and retryable network classification. `executeOutboundDelivery` will classify this as ambiguous and write `UNKNOWN`.

- [ ] **Step 4: Implement and document env validation**

Parse `PROVIDER_REQUEST_TIMEOUT_MS`, require it to be positive, and reject leases with less than a five-second persistence margin. Pass the timeout into every worker-created Meta/Facebook client.

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/lib/meta/client.test.ts src/lib/facebook/client.test.ts src/lib/env.test.ts src/lib/automation/outbound-delivery.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/meta src/lib/facebook/client.ts src/lib/facebook/client.test.ts src/lib/env.ts src/lib/env.test.ts .env.example .env.production.example docker-compose.production.yml src/worker.ts
git commit -m "fix(provider): bound outbound request duration"
```

### Task 5: Safe stage-level latency telemetry

**Files:**
- Create: `src/lib/automation/delivery-timing.ts`
- Create: `src/lib/automation/delivery-timing.test.ts`
- Modify: `src/lib/automation/outbound-delivery.ts`
- Modify: `src/lib/automation/runner.ts`
- Modify: `src/lib/facebook/runner.ts`
- Modify: `src/worker.ts`

**Interfaces:**
- Produces: `DeliveryTimingObserver` with `providerStarted()` and `providerFinished(durationMs)`.
- Produces: `createDeliveryTiming(ingestedAt, now)` returning hooks and `snapshot()`.
- Snapshot fields: `queueWaitMs`, `preProviderMs`, `providerMs`, `totalMs`, `providerCalls`.

- [ ] **Step 1: Write failing pure timing tests**

Use a deterministic clock and assert one and multiple provider calls:

```ts
const readings = [1_050, 1_080, 1_200];
const timing = createDeliveryTiming(1_000, () => readings.shift() ?? 1_200);
timing.workerStarted();
timing.providerStarted();
timing.providerFinished(120);
expect(timing.snapshot()).toEqual({
  queueWaitMs: 50,
  preProviderMs: 30,
  providerMs: 120,
  totalMs: 200,
  providerCalls: 1,
});
```

- [ ] **Step 2: Run timing tests and verify failure**

Run: `pnpm vitest run src/lib/automation/delivery-timing.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the timing accumulator**

Clamp durations to non-negative integers. Record only the first provider start for `preProviderMs`, sum provider durations, and never accept or return event payload data.

- [ ] **Step 4: Wire hooks through runners**

Extend runner options with an optional observer. Wrap each provider send with `performance.now()` and report start/finish in `finally`. Apply the same wrapper to Facebook's direct comment reply.

- [ ] **Step 5: Log one safe event per realtime job**

In the worker, strip `linkarIngestedAt` before passing the event to the runner, create a timing accumulator, and log:

```ts
logger.info("Realtime automation timing", {
  jobId: job.id,
  channel: job.name === "facebook-event" ? "facebook" : "instagram",
  outcome: "completed",
  ...timing.snapshot(),
});
```

On errors, log `outcome: "failed"` and the safe error code, not the message/payload. Rename the generic worker completion/failure log so it no longer labels every job as Instagram.

- [ ] **Step 6: Run timing, runner, Facebook, and worker build tests**

Run: `pnpm vitest run src/lib/automation/delivery-timing.test.ts src/lib/automation/runner.test.ts src/lib/facebook/runner.test.ts`

Run: `pnpm build:worker`

Expected: all tests PASS and worker bundle completes.

- [ ] **Step 7: Commit**

```bash
git add src/lib/automation/delivery-timing* src/lib/automation/outbound-delivery.ts src/lib/automation/runner.ts src/lib/facebook/runner.ts src/worker.ts
git commit -m "feat(ops): measure automation delivery latency"
```

### Task 6: Full regression and production-readiness verification

**Files:**
- Modify only if verification exposes a defect in the files already listed above.

**Interfaces:**
- Consumes: all interfaces produced by Tasks 1-5.
- Produces: a verified build with unchanged external webhook and automation API contracts.

- [ ] **Step 1: Run the complete unit suite**

Run: `pnpm test`

Expected: all Vitest tests PASS.

- [ ] **Step 2: Run static verification**

Run: `pnpm typecheck`

Expected: exit 0.

Run: `pnpm lint`

Expected: exit 0.

- [ ] **Step 3: Build application and worker**

Run: `pnpm build`

Expected: Prisma generation, Next.js build, and worker bundle all complete successfully.

- [ ] **Step 4: Validate production Compose**

Run: `pnpm check:compose`

Expected: exit 0 with the new timeout environment default accepted.

- [ ] **Step 5: Inspect diff and safety properties**

Run: `git diff HEAD~5 --check`

Run: `rg -n "accessToken|recipientId|payload|message" src/worker.ts src/lib/automation/delivery-timing.ts`

Expected: no whitespace errors and no sensitive values included in timing logs.

- [ ] **Step 6: Commit verification-only corrections if needed**

If verification required corrections, stage each explicitly named corrected file and commit it. If verification made no corrections, skip this step. Example when only the worker and timing utility changed:

```bash
git add src/worker.ts src/lib/automation/delivery-timing.ts
git commit -m "test: complete delivery latency verification"
```

- [ ] **Step 7: Report rollout measurements**

After deployment, compare p50/p95/p99 for `queueWaitMs`, `preProviderMs`, `providerMs`, and `totalMs`. Raise `WORKER_CONCURRENCY` only if queue-wait p95 remains above 100 ms while database latency and Meta 429/5xx rates stay healthy.
