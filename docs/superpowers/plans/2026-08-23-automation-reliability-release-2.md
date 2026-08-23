# Automation Reliability Release 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared outbound-delivery ledger, atomic message quotas, resumable runners, durable lead-webhook work, and reconciliation so retries cannot silently duplicate previously accepted outreach.

**Architecture:** Every outbound side effect receives a deterministic delivery key and a persisted payload before a provider call. Atomic claims serialize workers; confirmed sends advance local state without resending, known pre-send failures may retry, and ambiguous provider outcomes become operator-visible `UNKNOWN` records that are never retried automatically.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/PostgreSQL 17, BullMQ/Valkey, Meta Graph API client, Node DNS/fetch, Vitest, Playwright, Docker Compose, Coolify.

**Spec:** `docs/superpowers/specs/2026-08-23-automation-reliability-audit-design.md`

## Global Constraints

- Begin only after Release 1 is deployed and its production verification record is complete.
- Before changing Next.js code, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` and `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` as required by `AGENTS.md`.
- Never claim provider-level exactly-once delivery because Meta supplies no idempotency key for these sends.
- `SENT` records are never sent again; `UNKNOWN` records are never retried automatically.
- An expired `CLAIMED` record is ambiguous and transitions to `UNKNOWN`, not back to `PENDING`.
- Explicit, classified pre-send or provider-rejection failures may transition to retryable `FAILED`.
- Persist the normalized outbound payload before attempting delivery so later automation edits do not change a retry.
- Daily limits count planned outbound Meta messages, not automation execution rows.
- `UNKNOWN` Meta attempts consume quota because the provider may have accepted them.
- Webhook redirects are followed manually for at most three hops; every destination is DNS-validated; each request has a five-second timeout.
- Do not send real production Instagram messages from automated tests.
- Use failing tests before production changes, keep the worktree clean between tasks, and commit each completed task.

---

### Task 1: Define the delivery-ledger and quota data model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260823200000_outbound_delivery_ledger/migration.sql`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/migration-history.test.ts`
- Create: `src/lib/outbound-delivery-migration.test.ts`

**Interfaces:**
- Consumes: workspace, automation, participant, sequence-enrollment, and broadcast IDs from existing records.
- Produces: `OutboundDeliveryRecord`, `EnsureOutboundDeliveryInput`, `OutboundDeliveryClaimResult`, `AutomationDailySendCounterRecord`, and repository method signatures used by every later task.

- [ ] **Step 1: Add failing migration-contract tests**

```ts
it("declares unique delivery keys and atomic quota keys", async () => {
  const sql = await readFile(migrationPath, "utf8");
  expect(sql).toContain('CREATE UNIQUE INDEX "OutboundDelivery_deliveryKey_key"');
  expect(sql).toContain('PRIMARY KEY ("automationId", "utcDate")');
  expect(sql).toContain('"state" TEXT NOT NULL');
  expect(sql).toContain('"payload" JSONB NOT NULL');
});
```

- [ ] **Step 2: Run migration tests and confirm the schema is absent**

Run: `pnpm vitest run src/lib/migration-history.test.ts src/lib/outbound-delivery-migration.test.ts`

Expected: FAIL because the new migration and models do not exist.

- [ ] **Step 3: Add exact repository types**

```ts
export type OutboundDeliveryState = "PENDING" | "CLAIMED" | "SENT" | "FAILED" | "UNKNOWN";
export type OutboundDeliveryResultCode =
  | "DELIVERED"
  | "PROVIDER_REJECTED"
  | "RETRYABLE_REJECTION"
  | "SUPPRESSED"
  | "WINDOW_CLOSED"
  | "AMBIGUOUS";
export type OutboundDeliveryKind =
  | "CLASSIC_ACTION"
  | "EMAIL_CAPTURE"
  | "CAMPAIGN_ACTION"
  | "SEQUENCE_STEP"
  | "BROADCAST_RECIPIENT"
  | "LEAD_EMAIL"
  | "LEAD_WEBHOOK";

export type OutboundDeliveryRecord = {
  id: string;
  deliveryKey: string;
  workspaceId: string;
  kind: OutboundDeliveryKind;
  recipientId?: string;
  instagramAccountId?: string;
  automationId?: string;
  participantId?: string;
  sequenceEnrollmentId?: string;
  broadcastId?: string;
  payload: Record<string, unknown>;
  state: OutboundDeliveryState;
  retryable: boolean;
  resultCode?: OutboundDeliveryResultCode;
  claimOwner?: string;
  claimExpiresAt?: string;
  attemptCount: number;
  providerMessageId?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  sentAt?: string;
};

export type EnsureOutboundDeliveryInput = Omit<
  OutboundDeliveryRecord,
  "id" | "state" | "retryable" | "resultCode" | "claimOwner" | "claimExpiresAt" | "attemptCount" | "providerMessageId" | "lastError" | "createdAt" | "updatedAt" | "sentAt"
>;

export type OutboundDeliveryClaimResult =
  | { claimed: true; record: OutboundDeliveryRecord }
  | { claimed: false; record: OutboundDeliveryRecord };

export type AutomationDailySendCounterRecord = {
  automationId: string;
  utcDate: string;
  reserved: number;
  updatedAt: string;
};
```

- [ ] **Step 4: Add repository method signatures**

```ts
ensureOutboundDelivery(input: EnsureOutboundDeliveryInput): Promise<OutboundDeliveryRecord>;
getOutboundDelivery(deliveryKey: string): Promise<OutboundDeliveryRecord | null>;
claimOutboundDelivery(deliveryKey: string, owner: string, leaseUntil: string): Promise<OutboundDeliveryClaimResult>;
completeOutboundDelivery(deliveryKey: string, owner: string, providerMessageId: string | undefined, sentAt: string): Promise<boolean>;
failOutboundDelivery(deliveryKey: string, owner: string, error: string, retryable: boolean, resultCode: "PROVIDER_REJECTED" | "RETRYABLE_REJECTION" | "SUPPRESSED" | "WINDOW_CLOSED"): Promise<boolean>;
markOutboundDeliveryUnknown(deliveryKey: string, owner: string | undefined, error: string): Promise<boolean>;
listExpiredDeliveryClaims(nowIso: string, limit: number): Promise<OutboundDeliveryRecord[]>;
claimAutomationSendSlots(automationId: string, utcDate: string, amount: number, limit: number): Promise<boolean>;
releaseAutomationSendSlots(automationId: string, utcDate: string, amount: number): Promise<void>;
```

- [ ] **Step 5: Add Prisma models and indexes**

```prisma
model OutboundDelivery {
  id                   String   @id
  deliveryKey          String   @unique
  workspaceId          String
  kind                 String
  recipientId          String?
  instagramAccountId   String?
  automationId         String?
  participantId        String?
  sequenceEnrollmentId String?
  broadcastId          String?
  payload              Json
  state                String   @default("PENDING")
  retryable            Boolean  @default(false)
  resultCode           String?
  claimOwner           String?
  claimExpiresAt       DateTime?
  attemptCount         Int      @default(0)
  providerMessageId    String?
  lastError            String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  sentAt               DateTime?
  workspace            Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([state, claimExpiresAt])
  @@index([workspaceId, kind, createdAt])
  @@index([broadcastId, state])
}

model AutomationDailySendCounter {
  automationId String
  utcDate      DateTime @db.Date
  reserved     Int      @default(0)
  updatedAt    DateTime @updatedAt
  automation   Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)

  @@id([automationId, utcDate])
}
```

Add `outboundDeliveries OutboundDelivery[]` to `Workspace` and `dailySendCounters AutomationDailySendCounter[]` to `Automation`. Keep the optional source IDs as unrelational scalar references so deleting a participant, sequence, or broadcast does not erase diagnostic delivery history. The workspace relation cascades when the entire workspace is deleted; quota rows cascade with automation deletion.

- [ ] **Step 6: Write explicit migration SQL**

Create both tables, their indexes, check constraints for valid states, kinds, result codes, and non-negative counters, plus workspace/automation foreign keys. The quota reservation transaction later depends on the composite primary key `("automationId", "utcDate")`.

- [ ] **Step 7: Validate and test the data model**

Run: `pnpm prisma validate && pnpm db:generate && pnpm vitest run src/lib/migration-history.test.ts src/lib/outbound-delivery-migration.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit schema contracts**

```bash
git add prisma/schema.prisma prisma/migrations/20260823200000_outbound_delivery_ledger src/lib/repository.ts src/lib/migration-history.test.ts src/lib/outbound-delivery-migration.test.ts
git commit -m "feat: define outbound delivery ledger"
```

### Task 2: Implement atomic ledger and quota repositories

**Files:**
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `src/lib/prisma.test.ts`
- Create: `src/lib/automation/delivery-repository-concurrency.test.ts`

**Interfaces:**
- Consumes: all repository types and signatures from Task 1.
- Produces: memory/Prisma parity, one-owner atomic claims, owner-checked terminal transitions, expired-claim listing, and non-overbooking quota reservations.

- [ ] **Step 1: Add failing repository state-machine tests**

```ts
const ensured = await repository.ensureOutboundDelivery(input);
expect((await repository.ensureOutboundDelivery({ ...input, payload: { text: "edited" } })).payload)
  .toEqual(input.payload);

const [a, b] = await Promise.all([
  repository.claimOutboundDelivery(input.deliveryKey, "worker_a", lease),
  repository.claimOutboundDelivery(input.deliveryKey, "worker_b", lease),
]);
expect([a.claimed, b.claimed].filter(Boolean)).toHaveLength(1);
```

Add transition cases for `PENDING -> CLAIMED -> SENT`, retryable `FAILED -> CLAIMED`, terminal `SENT`, terminal `UNKNOWN`, wrong-owner completion, and expired claims returned by `listExpiredDeliveryClaims`.

- [ ] **Step 2: Add failing concurrent quota tests**

```ts
const results = await Promise.all([
  repository.claimAutomationSendSlots("automation_1", "2026-08-23", 2, 3),
  repository.claimAutomationSendSlots("automation_1", "2026-08-23", 2, 3),
]);
expect(results.filter(Boolean)).toHaveLength(1);
```

- [ ] **Step 3: Run repository tests and observe missing methods**

Run: `pnpm vitest run src/lib/repository.test.ts src/lib/prisma.test.ts src/lib/automation/delivery-repository-concurrency.test.ts`

Expected: FAIL because ledger and quota methods are unimplemented.

- [ ] **Step 4: Implement memory state transitions**

Use `Map<string, OutboundDeliveryRecord>` keyed by `deliveryKey`. Preserve the first payload in `ensureOutboundDelivery`. Permit claims only from `PENDING` and `FAILED` records whose `retryable` field is true. Persist known permanent rejections as `FAILED` with `retryable: false`; persist ambiguous outcomes as `UNKNOWN`. Increment `attemptCount` on successful claim.

```ts
if (record.state !== "PENDING" && !(record.state === "FAILED" && record.retryable)) return { claimed: false, record };
const claimed = { ...record, state: "CLAIMED" as const, retryable: false, claimOwner: owner, claimExpiresAt: leaseUntil, attemptCount: record.attemptCount + 1, updatedAt: now() };
deliveries.set(deliveryKey, claimed);
return { claimed: true, record: claimed };
```

- [ ] **Step 5: Implement Prisma claims with conditional updates**

```ts
const updated = await prisma.outboundDelivery.updateMany({
  where: {
    deliveryKey,
    OR: [{ state: "PENDING" }, { state: "FAILED", retryable: true }],
  },
  data: { state: "CLAIMED", retryable: false, claimOwner: owner, claimExpiresAt: new Date(leaseUntil), attemptCount: { increment: 1 } },
});
const record = await prisma.outboundDelivery.findUniqueOrThrow({ where: { deliveryKey } });
return { claimed: updated.count === 1, record: mapOutboundDelivery(record) };
```

All completion/failure updates include `state: "CLAIMED"` and `claimOwner: owner` in the `where` predicate. `ensureOutboundDelivery` catches the unique race, then reads the winner without overwriting its payload.

- [ ] **Step 6: Implement an atomic quota transaction**

Use PostgreSQL `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE reserved + amount <= limit RETURNING reserved` through `$queryRaw`, with numeric parameters and a validated ISO UTC date.

```sql
INSERT INTO "AutomationDailySendCounter" ("automationId", "utcDate", "reserved", "updatedAt")
VALUES ($1, $2::date, $3, NOW())
ON CONFLICT ("automationId", "utcDate") DO UPDATE
SET "reserved" = "AutomationDailySendCounter"."reserved" + EXCLUDED."reserved",
    "updatedAt" = NOW()
WHERE "AutomationDailySendCounter"."reserved" + EXCLUDED."reserved" <= $4
RETURNING "reserved";
```

Reject `amount <= 0` and `limit < amount` before SQL. Release with `GREATEST(0, reserved - amount)`.

- [ ] **Step 7: Run parity and concurrency tests**

Run: `pnpm vitest run src/lib/repository.test.ts src/lib/prisma.test.ts src/lib/automation/delivery-repository-concurrency.test.ts`

Expected: PASS for memory and PostgreSQL-backed implementations.

- [ ] **Step 8: Commit repository behavior**

```bash
git add src/lib/memory-repository.ts src/lib/prisma.ts src/lib/repository.test.ts src/lib/prisma.test.ts src/lib/automation/delivery-repository-concurrency.test.ts
git commit -m "feat: implement atomic delivery claims and quotas"
```

### Task 3: Build the shared outbound-delivery coordinator

**Files:**
- Create: `src/lib/automation/outbound-delivery.ts`
- Create: `src/lib/automation/outbound-delivery.test.ts`
- Modify: `src/lib/meta/client.ts`
- Modify: `src/lib/meta/client.test.ts`

**Interfaces:**
- Consumes: Task 2 repository methods and provider functions returning `{ id?: string }` or throwing `MetaApiError`.
- Produces: `executeOutboundDelivery<TPayload>(request, send): Promise<DeliveryExecutionResult>` and `classifyProviderFailure(error): "KNOWN_RETRYABLE" | "KNOWN_PERMANENT" | "AMBIGUOUS"`.

- [ ] **Step 1: Add failing coordinator state-machine tests**

```ts
it("skips the provider for an existing SENT delivery", async () => {
  await seedDelivery({ ...delivery, state: "SENT" });
  await expect(executeOutboundDelivery(request, send)).resolves.toMatchObject({ status: "SENT", reused: true });
  expect(send).not.toHaveBeenCalled();
});

it("marks a status-zero failure UNKNOWN", async () => {
  send.mockRejectedValue(new MetaApiError("network", 0));
  await expect(executeOutboundDelivery(request, send)).resolves.toMatchObject({ status: "UNKNOWN" });
  expect((await repository.getOutboundDelivery(request.deliveryKey))?.state).toBe("UNKNOWN");
});
```

Add cases for one provider call under concurrent execution, explicit retryable 429/5xx rejection, permanent 4xx rejection, payload preservation, and state-persistence failure after provider success.

- [ ] **Step 2: Run coordinator tests and confirm the module is missing**

Run: `pnpm vitest run src/lib/automation/outbound-delivery.test.ts src/lib/meta/client.test.ts`

Expected: FAIL because coordinator and explicit Meta error classification are absent.

- [ ] **Step 3: Define coordinator contracts and deterministic key helpers**

```ts
export type DeliveryExecutionRequest<TPayload extends Record<string, unknown>> = EnsureOutboundDeliveryInput & {
  payload: TPayload;
  claimLeaseMs: number;
};

export type DeliveryExecutionResult =
  | { status: "SENT"; providerMessageId?: string; reused: boolean }
  | { status: "FAILED"; retryable: boolean; error: string }
  | { status: "UNKNOWN"; error: string }
  | { status: "BUSY" };

export const deliveryKeys = {
  classicAction: (automationId: string, eventId: string, index: number) => `automation:${automationId}:event:${eventId}:action:${index}`,
  emailCapture: (automationId: string, eventId: string, stage: string) => `automation:${automationId}:event:${eventId}:capture:${stage}`,
  campaignAction: (participantId: string, action: string) => `campaign:${participantId}:action:${action}`,
  sequenceStep: (enrollmentId: string, stepId: string) => `sequence:${enrollmentId}:step:${stepId}`,
  broadcastRecipient: (broadcastId: string, accountId: string, recipientId: string) => `broadcast:${broadcastId}:${accountId}:${recipientId}`,
  lead: (contactId: string, automationId: string, channel: "email" | "webhook", stage: string) => `lead:${contactId}:automation:${automationId}:${channel}:${stage}`,
};
```

- [ ] **Step 4: Implement failure classification**

Add `responseReceived: boolean` to `MetaApiError`, setting it to true only after an HTTP response arrives. Classify an error as `AMBIGUOUS` when no HTTP status exists, status is 0, the request timed out after socket write, or response parsing failed after a 2xx status. Classify explicit HTTP 408, 429, and 5xx responses as `KNOWN_RETRYABLE` only when the Meta client proves a response was received. Other explicit 4xx responses are `KNOWN_PERMANENT`.

```ts
export class MetaApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseReceived: boolean,
  ) {
    super(message);
  }
}

export function classifyProviderFailure(error: unknown): ProviderFailureClass {
  if (!(error instanceof MetaApiError) || !error.responseReceived || error.status === 0) return "AMBIGUOUS";
  if (error.status === 408 || error.status === 429 || error.status >= 500) return "KNOWN_RETRYABLE";
  return "KNOWN_PERMANENT";
}
```

- [ ] **Step 5: Implement coordinator transitions**

Ensure then inspect the record. Return immediately for `SENT`/`UNKNOWN`; return `BUSY` for `CLAIMED`; return `{ status: "FAILED", retryable: false }` for permanent `FAILED`. Claim `PENDING` or retryable `FAILED`, call `send(claimed.payload)`, then complete with `resultCode: "DELIVERED"`. Known retryable rejection calls `failOutboundDelivery` with `RETRYABLE_REJECTION`; known permanent rejection uses `PROVIDER_REJECTED`; ambiguous failure calls `markOutboundDeliveryUnknown`, which stores `AMBIGUOUS`. If completion throws after the provider returned, best-effort mark `UNKNOWN` and return `UNKNOWN`; never throw into an automatic provider retry path.

- [ ] **Step 6: Run coordinator and client tests**

Run: `pnpm vitest run src/lib/automation/outbound-delivery.test.ts src/lib/meta/client.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the coordinator**

```bash
git add src/lib/automation/outbound-delivery.ts src/lib/automation/outbound-delivery.test.ts src/lib/meta/client.ts src/lib/meta/client.test.ts
git commit -m "feat: coordinate idempotent outbound delivery"
```

### Task 4: Resume classic actions and email-capture transitions

**Files:**
- Modify: `src/lib/automation/runner.ts`
- Modify: `src/lib/automation/runner.test.ts`
- Modify: `src/lib/automation/conversation-triggers.test.ts`
- Modify: `src/lib/automation/field-collection.test.ts`

**Interfaces:**
- Consumes: `executeOutboundDelivery` and `deliveryKeys.classicAction/emailCapture/lead` from Task 3.
- Produces: per-index classic action delivery; persisted email confirmation/question delivery before contact-state finalization; retries resume the first incomplete transition.

- [ ] **Step 1: Add failing later-action replay test**

```ts
client.sendDirectMessage
  .mockResolvedValueOnce({ id: "one" })
  .mockRejectedValueOnce(explicitRetryableError)
  .mockResolvedValueOnce({ id: "two" });
await processNormalizedEvent(event, repository, options);
await processNormalizedEvent(event, repository, options);
expect(client.sendDirectMessage.mock.calls.map((call) => call[2].text)).toEqual(["first", "second", "second"]);
```

- [ ] **Step 2: Add failing email-capture resume tests**

```ts
it("retries the confirmation without replaying the original automation", async () => {
  await seedAwaitingEmailContact();
  client.sendDirectMessage.mockRejectedValueOnce(explicitRetryableError).mockResolvedValueOnce({ id: "confirmation" });
  await processNormalizedEvent(emailReply, repository, options);
  await processNormalizedEvent(emailReply, repository, options);
  expect(sentTexts()).toEqual(["Thanks — email saved.", "Thanks — email saved."]);
  expect(originalActionSendCount()).toBe(0);
});
```

Also cover next custom question, final confirmation, fulfillment email enqueue key, and contact state not advancing before the ledger is `SENT`.

- [ ] **Step 3: Run runner tests and reproduce replay/loss**

Run: `pnpm vitest run src/lib/automation/runner.test.ts src/lib/automation/conversation-triggers.test.ts src/lib/automation/field-collection.test.ts`

Expected: FAIL with earlier actions duplicated or follow-up state advanced before durable send completion.

- [ ] **Step 4: Route each classic action through its indexed ledger key**

```ts
for (const [index, action] of automation.definition.actions.entries()) {
  const result = await executeOutboundDelivery({
    deliveryKey: deliveryKeys.classicAction(automation.id, event.id, index),
    workspaceId: automation.workspaceId,
    automationId: automation.id,
    instagramAccountId: event.accountId,
    recipientId: event.recipientId,
    kind: "CLASSIC_ACTION",
    payload: normalizeActionPayload(action),
    claimLeaseMs: options.dispatchLeaseMs,
  }, (payload) => sendNormalizedAction(client, connection, event.recipientId!, payload));
  if (result.status !== "SENT") return deliveryResultToRunnerResult(result);
}
```

- [ ] **Step 5: Reorder email-capture transitions around durable sends**

After persisting the captured answer, ensure the confirmation/question delivery and require `SENT` before calling `beginContactFieldCollection`, `recordContactFieldAnswer`, or `clearContactAwaitingEmail`. A retry first checks existing contact/ledger state and resumes its delivery key without entering ordinary automation matching.

- [ ] **Step 6: Run classic and capture tests**

Run: `pnpm vitest run src/lib/automation/runner.test.ts src/lib/automation/conversation-triggers.test.ts src/lib/automation/field-collection.test.ts`

Expected: PASS; the later-action retry sequence is exactly `first, second, second`, never `first, second, first, second`.

- [ ] **Step 7: Commit resumable classic delivery**

```bash
git add src/lib/automation/runner.ts src/lib/automation/runner.test.ts src/lib/automation/conversation-triggers.test.ts src/lib/automation/field-collection.test.ts
git commit -m "fix: resume classic automation deliveries"
```

### Task 5: Integrate campaign delivery and atomic daily quotas

**Files:**
- Modify: `src/lib/automation/send-limits.ts`
- Create: `src/lib/automation/send-limits.test.ts`
- Modify: `src/lib/automation/campaign-runner.ts`
- Modify: `src/lib/automation/campaign-runner.test.ts`
- Modify: `src/lib/automation/runner.ts`
- Modify: `src/lib/automation/runner.test.ts`

**Interfaces:**
- Consumes: `deliveryKeys.campaignAction`, `executeOutboundDelivery`, and quota repository methods.
- Produces: `reserveDailySendSlots(context, amount): Promise<SendLimitReservation>`; every outbound classic/campaign message reserves one slot immediately before its claim.

- [ ] **Step 1: Add failing multi-action quota and campaign ambiguity tests**

```ts
it("allows only three provider calls across concurrent two-action events", async () => {
  await Promise.all([runEvent("event_a"), runEvent("event_b")]);
  expect(client.sendDirectMessage).toHaveBeenCalledTimes(3);
});

it("does not resend an ambiguous campaign action", async () => {
  client.sendDirectMessage.mockRejectedValueOnce(statusZeroError);
  await processCampaignEvent(event, repository, options);
  await processCampaignEvent(event, repository, options);
  expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run campaign and send-limit tests**

Run: `pnpm vitest run src/lib/automation/send-limits.test.ts src/lib/automation/campaign-runner.test.ts src/lib/automation/runner.test.ts`

Expected: FAIL because limits count executions non-atomically and campaign action claims do not share the ledger contract.

- [ ] **Step 3: Replace the read-then-count limit API**

```ts
export type SendLimitReservation =
  | { allowed: true; utcDate: string; amount: number }
  | { allowed: false; reason: "daily_limit" };

export async function reserveDailySendSlots(
  context: SendLimitContext,
  amount: number,
): Promise<SendLimitReservation> {
  if (!context.limit) return { allowed: true, utcDate: utcDate(context.now), amount: 0 };
  const date = utcDate(context.now);
  const allowed = await context.repository.claimAutomationSendSlots(context.automationId, date, amount, context.limit);
  return allowed ? { allowed: true, utcDate: date, amount } : { allowed: false, reason: "daily_limit" };
}
```

- [ ] **Step 4: Reserve immediately before each ledger execution**

Reserve one slot only when the ledger record is `PENDING` or retryable `FAILED`. Do not reserve for `SENT`, `UNKNOWN`, or another worker's `CLAIMED` record. Release the slot only when failure classification proves the request was not sent; keep the slot for `SENT` and `UNKNOWN`.

- [ ] **Step 5: Replace campaign action execution claims with delivery keys**

Map existing `actionDedupeKey(participantId, action)` values to `deliveryKeys.campaignAction`. Preserve participant state transitions, but make every provider call pass through `executeOutboundDelivery`; if it returns reused `SENT`, complete the pending participant transition without calling Meta.

- [ ] **Step 6: Run quota and campaign regression tests**

Run: `pnpm vitest run src/lib/automation/send-limits.test.ts src/lib/automation/campaign-runner.test.ts src/lib/automation/runner.test.ts`

Expected: PASS under concurrent events, ambiguous errors, and state-transition retries.

- [ ] **Step 7: Commit campaign and quota integration**

```bash
git add src/lib/automation/send-limits.ts src/lib/automation/send-limits.test.ts src/lib/automation/campaign-runner.ts src/lib/automation/campaign-runner.test.ts src/lib/automation/runner.ts src/lib/automation/runner.test.ts
git commit -m "fix: enforce atomic automation send quotas"
```

### Task 6: Claim sequence steps and reconcile interrupted state transitions

**Files:**
- Modify: `src/lib/automation/sequence-runner.ts`
- Modify: `src/lib/automation/tier2.test.ts`
- Create: `src/lib/automation/sequence-runner-concurrency.test.ts`
- Create: `src/lib/automation/delivery-reconciliation.ts`
- Create: `src/lib/automation/delivery-reconciliation.test.ts`
- Modify: `src/worker.ts`

**Interfaces:**
- Consumes: `deliveryKeys.sequenceStep`, `executeOutboundDelivery`, `listExpiredDeliveryClaims`, and `advanceSequenceEnrollment`.
- Produces: one provider call per deterministic step, state-only advancement for reused `SENT`, and `reconcileExpiredDeliveryClaims(repository, nowIso, limit)`.

- [ ] **Step 1: Add failing concurrent sweep and persistence-failure tests**

```ts
await Promise.all([
  processDueSequences(repository, options),
  processDueSequences(repository, options),
]);
expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);

repository.advanceSequenceEnrollment.mockRejectedValueOnce(new Error("database unavailable"));
await processDueSequences(repository, options);
await processDueSequences(repository, options);
expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
expect(repository.advanceSequenceEnrollment).toHaveBeenCalledTimes(2);
```

- [ ] **Step 2: Add failing expired-claim reconciliation test**

```ts
await reconcileExpiredDeliveryClaims(repository, now, 100);
expect(repository.markOutboundDeliveryUnknown).toHaveBeenCalledWith(
  delivery.deliveryKey, undefined, "Delivery claim expired before confirmation",
);
```

- [ ] **Step 3: Run sequence and reconciliation tests**

Run: `pnpm vitest run src/lib/automation/tier2.test.ts src/lib/automation/sequence-runner-concurrency.test.ts src/lib/automation/delivery-reconciliation.test.ts`

Expected: FAIL because due rows have no per-step claim and reconciliation is absent.

- [ ] **Step 4: Execute each due step through the ledger**

```ts
const step = due.sequence.steps[due.enrollment.currentStepIndex];
const result = await executeOutboundDelivery({
  deliveryKey: deliveryKeys.sequenceStep(due.enrollment.id, step.id),
  workspaceId: due.enrollment.workspaceId,
  sequenceEnrollmentId: due.enrollment.id,
  instagramAccountId: due.contact.instagramAccountId,
  recipientId: due.contact.igScopedUserId,
  kind: "SEQUENCE_STEP",
  payload: { type: "text", text: step.text },
  claimLeaseMs: options.claimLeaseMs,
}, (payload) => options.client.sendDirectMessage(connection, due.contact.igScopedUserId, payload));
```

Advance only when `result.status === "SENT"`, whether new or reused. Do not advance on `BUSY`, `FAILED`, or `UNKNOWN`.

- [ ] **Step 5: Implement expired-claim reconciliation**

```ts
export async function reconcileExpiredDeliveryClaims(repository: AutomationRepository, nowIso: string, limit: number) {
  const expired = await repository.listExpiredDeliveryClaims(nowIso, limit);
  for (const delivery of expired) {
    await repository.markOutboundDeliveryUnknown(delivery.deliveryKey, undefined, "Delivery claim expired before confirmation");
  }
  return { unknown: expired.length };
}
```

Run it at worker startup and every five minutes with overlap protection, logging counts without payload contents.

- [ ] **Step 6: Run sequence concurrency tests**

Run: `pnpm vitest run src/lib/automation/tier2.test.ts src/lib/automation/sequence-runner-concurrency.test.ts src/lib/automation/delivery-reconciliation.test.ts src/lib/runtime-commands.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit sequence claims and reconciliation**

```bash
git add src/lib/automation/sequence-runner.ts src/lib/automation/tier2.test.ts src/lib/automation/sequence-runner-concurrency.test.ts src/lib/automation/delivery-reconciliation.ts src/lib/automation/delivery-reconciliation.test.ts src/worker.ts src/lib/runtime-commands.test.ts
git commit -m "fix: claim and reconcile sequence deliveries"
```

### Task 7: Derive broadcast progress from recipient deliveries

**Files:**
- Modify: `src/lib/automation/broadcast-runner.ts`
- Create: `src/lib/automation/broadcast-runner.test.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `app/api/broadcasts/route.ts`
- Modify: `app/api/broadcasts/route.test.ts`
- Modify: `src/worker.ts`

**Interfaces:**
- Consumes: `deliveryKeys.broadcastRecipient`, coordinator, and exact enqueue results from Release 1.
- Produces: one ledger record for every intended recipient before queue fan-out; `reconcileBroadcastCounters(workspaceId, broadcastId)` derives totals from ledger states.

- [ ] **Step 1: Add failing broadcast retry and counter-convergence tests**

```ts
it("does not resend after provider success and counter failure", async () => {
  repository.reconcileBroadcastCounters.mockRejectedValueOnce(new Error("database unavailable"));
  await processBroadcastSend(job, repository, options);
  await processBroadcastSend(job, repository, options);
  expect(client.sendDirectMessage).toHaveBeenCalledTimes(1);
});

expect(await repository.reconcileBroadcastCounters("workspace_1", "broadcast_1"))
  .toEqual({ total: 4, sent: 1, failed: 1, skipped: 1, pending: 1 });
```

- [ ] **Step 2: Run broadcast tests and reproduce duplicate/counter drift**

Run: `pnpm vitest run src/lib/automation/broadcast-runner.test.ts app/api/broadcasts/route.test.ts src/lib/repository.test.ts`

Expected: FAIL because the worker increments counters imperatively and retries can call Meta again.

- [ ] **Step 3: Ensure recipient delivery rows before enqueue**

```ts
const deliveries = await Promise.all(recipients.map((recipient) => repository.ensureOutboundDelivery({
  deliveryKey: deliveryKeys.broadcastRecipient(broadcast.id, recipient.instagramAccountId, recipient.igScopedUserId),
  workspaceId: session.workspaceId,
  broadcastId: broadcast.id,
  instagramAccountId: recipient.instagramAccountId,
  recipientId: recipient.igScopedUserId,
  kind: "BROADCAST_RECIPIENT",
  payload: { type: "text", text: input.text },
})));
```

Queue jobs reference `deliveryKey`; they do not carry editable message text as their source of truth.

- [ ] **Step 4: Route worker delivery through the coordinator**

Load the persisted payload by key, execute it once, then call `reconcileBroadcastCounters`. A suppressed or closed-window recipient is marked `FAILED` only for a known permanent reason and counted as skipped by the aggregate mapping.

- [ ] **Step 5: Implement aggregate counter reconciliation**

```ts
reconcileBroadcastCounters(workspaceId: string, broadcastId: string): Promise<{
  total: number; sent: number; failed: number; skipped: number; pending: number;
}>;
```

Use one Prisma `groupBy({ by: ["state", "resultCode"], where: { workspaceId, broadcastId } })`. Count `SUPPRESSED` and `WINDOW_CLOSED` as skipped, `DELIVERED` as sent, permanent provider rejection as failed, and `PENDING`/`CLAIMED`/retryable `FAILED`/`UNKNOWN` as pending. Update the broadcast row in the same transaction. Set `completedAt` only when `pending === 0`; keep `UNKNOWN` visible as pending/operator-action rather than reporting false completion.

- [ ] **Step 6: Run broadcast worker, route, and repository tests**

Run: `pnpm vitest run src/lib/automation/broadcast-runner.test.ts app/api/broadcasts/route.test.ts src/lib/repository.test.ts`

Expected: PASS with one provider call and converged counters after replay.

- [ ] **Step 7: Commit ledger-backed broadcasts**

```bash
git add src/lib/automation/broadcast-runner.ts src/lib/automation/broadcast-runner.test.ts src/lib/repository.ts src/lib/memory-repository.ts src/lib/prisma.ts src/lib/repository.test.ts app/api/broadcasts/route.ts app/api/broadcasts/route.test.ts src/worker.ts
git commit -m "fix: reconcile broadcast recipient delivery"
```

### Task 8: Deliver lead webhooks durably with DNS-safe redirects

**Files:**
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/queue.test.ts`
- Create: `src/lib/automation/lead-delivery.ts`
- Create: `src/lib/automation/lead-delivery.test.ts`
- Modify: `src/lib/automation/runner.ts`
- Modify: `src/lib/automation/conversation-triggers.test.ts`
- Modify: `src/lib/security/outbound-url.ts`
- Modify: `src/lib/security/outbound-url.test.ts`
- Modify: `src/worker.ts`

**Interfaces:**
- Consumes: `deliveryKeys.lead`, BullMQ queue, `node:dns/promises.lookup`, and outbound URL syntax validation.
- Produces: `LeadDeliveryJob`, `enqueueLeadDelivery`, `processLeadDelivery`, `resolveSafeOutboundTarget`, and manual redirect delivery with exact limits.

- [ ] **Step 1: Add failing non-2xx, durability, DNS-rebinding, and redirect tests**

```ts
it("fails a lead webhook on HTTP 500", async () => {
  fetchMock.mockResolvedValue(new Response("down", { status: 500 }));
  await expect(processLeadDelivery(job, repository, options)).resolves.toMatchObject({ status: "FAILED" });
});

it.each(["127.0.0.1", "169.254.169.254", "10.0.0.8", "::1", "fc00::1", "fe80::1"])(
  "blocks a public hostname resolving to %s", async (address) => {
    lookup.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
    await expect(resolveSafeOutboundTarget("https://public.example/hook", { lookup })).rejects.toThrow("public address");
  },
);
```

Add redirect tests for a public first URL redirecting to private IP, four redirects, credential-bearing targets, and five-second abort.

- [ ] **Step 2: Run lead and URL-security tests**

Run: `pnpm vitest run src/lib/automation/lead-delivery.test.ts src/lib/security/outbound-url.test.ts src/lib/queue.test.ts src/lib/automation/conversation-triggers.test.ts`

Expected: FAIL because lead delivery is fire-and-forget, non-2xx is accepted, DNS is not resolved, and redirects are automatic.

- [ ] **Step 3: Add durable lead job contracts**

```ts
export type LeadDeliveryJob = {
  deliveryKey: string;
  workspaceId: string;
  kind: "LEAD_EMAIL" | "LEAD_WEBHOOK";
};

export async function enqueueLeadDelivery(job: LeadDeliveryJob): Promise<boolean> {
  const queue = getWebhookQueue();
  if (!queue) return false;
  await queue.add("lead-delivery", job, {
    jobId: `lead:${createHash("sha256").update(job.deliveryKey).digest("base64url")}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: 1_000,
    removeOnFail: 5_000,
  });
  return true;
}
```

Ensure the ledger payload first, then enqueue only its key. When no queue exists, process synchronously through the same handler rather than detaching a promise.

- [ ] **Step 4: Implement DNS and redirect validation**

```ts
export async function resolveSafeOutboundTarget(
  value: string,
  dependencies = { lookup },
): Promise<URL> {
  if (!isSafeOutboundUrl(value)) throw new Error("Webhook URL is not allowed");
  const url = new URL(value);
  const addresses = await dependencies.lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedAddress(address))) {
    throw new Error("Webhook host must resolve only to public addresses");
  }
  return url;
}
```

Export/test `isBlockedAddress`. For each hop, call fetch with `redirect: "manual"` and an `AbortSignal.timeout(5_000)`. Accept only 2xx. For 301/302/303/307/308, resolve `Location` against the current URL, validate it again, and stop after three redirects.

- [ ] **Step 5: Classify webhook outcomes through the ledger**

DNS rejection and explicit 4xx are permanent. Explicit 408/429/5xx are retryable. Timeout or socket failure after request start is ambiguous and becomes `UNKNOWN`. Do not automatically retry an `UNKNOWN` lead webhook.

- [ ] **Step 6: Register lead jobs in the worker**

Add a `case "lead-delivery"` branch that calls `processLeadDelivery` and returns successfully for ledger terminal states. Throw only for `FAILED` with `retryable: true`, allowing BullMQ's finite attempt budget.

- [ ] **Step 7: Run durable lead and security tests**

Run: `pnpm vitest run src/lib/automation/lead-delivery.test.ts src/lib/security/outbound-url.test.ts src/lib/queue.test.ts src/lib/automation/conversation-triggers.test.ts src/lib/runtime-commands.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit durable lead delivery**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts src/lib/automation/lead-delivery.ts src/lib/automation/lead-delivery.test.ts src/lib/automation/runner.ts src/lib/automation/conversation-triggers.test.ts src/lib/security/outbound-url.ts src/lib/security/outbound-url.test.ts src/worker.ts src/lib/runtime-commands.test.ts
git commit -m "fix: deliver lead webhooks durably"
```

### Task 9: Return retryable inline failures and expose delivery diagnostics

**Files:**
- Modify: `app/api/meta/webhook/route.ts`
- Create: `app/api/meta/webhook/route.test.ts`
- Modify: `src/lib/automation/runner.ts`
- Modify: `src/lib/automation/runner.test.ts`
- Create: `app/api/automations/deliveries/route.ts`
- Create: `app/api/automations/deliveries/route.test.ts`
- Create: `src/components/delivery-diagnostics.tsx`
- Create: `src/components/delivery-diagnostics.test.tsx`
- Modify: `src/components/automations-screen.tsx`

**Interfaces:**
- Consumes: runner result classifications and ledger repository reads.
- Produces: HTTP 503 for retryable inline failures, HTTP 200 for permanent/handled events, and an authenticated diagnostics view for `FAILED`/`UNKNOWN` deliveries.

- [ ] **Step 1: Add failing webhook-response tests**

```ts
it("returns 503 when inline processing has a retryable failure", async () => {
  mocks.enqueueWebhookEvents.mockResolvedValue(0);
  mocks.processNormalizedEvent.mockRejectedValue(new RetryableAutomationError("Meta 429"));
  const response = await POST(signedWebhookRequest(payload));
  expect(response.status).toBe(503);
});

it("acknowledges a permanent validation failure", async () => {
  mocks.processNormalizedEvent.mockResolvedValue({ handled: true, retryable: false });
  expect((await POST(signedWebhookRequest(payload))).status).toBe(200);
});
```

- [ ] **Step 2: Add failing diagnostics route/component tests**

```ts
expect(await diagnosticsGET(revokedRequest)).toHaveStatus(401);
expect(await diagnosticsGET(validRequest)).toHaveJson({
  data: [expect.objectContaining({ state: "UNKNOWN", deliveryKey: expect.any(String), lastError: expect.any(String) })],
});
render(<DeliveryDiagnostics />);
expect(await screen.findByText("Needs review")).toBeVisible();
```

- [ ] **Step 3: Run webhook and diagnostics tests**

Run: `pnpm vitest run app/api/meta/webhook/route.test.ts app/api/automations/deliveries/route.test.ts src/components/delivery-diagnostics.test.tsx src/lib/automation/runner.test.ts`

Expected: FAIL because inline failures are swallowed and no diagnostics surface exists.

- [ ] **Step 4: Return 503 only for retryable inline outcomes**

Define the error contract in `src/lib/automation/runner.ts` and use it only when a retryable failure still needs the source webhook to be redelivered:

```ts
export class RetryableAutomationError extends Error {
  readonly retryable = true;
}

export function isRetryableAutomationError(error: unknown): error is RetryableAutomationError {
  return error instanceof RetryableAutomationError;
}
```

Then aggregate inline outcomes without stopping later events in the same signed payload:

```ts
let retryableFailure = false;
for (const event of events) {
  try {
    await processNormalizedEvent(event, repository, options);
  } catch (error) {
    logger.error("Inline webhook event processing failed", safeErrorContext(event, error));
    if (isRetryableAutomationError(error)) retryableFailure = true;
  }
}
if (retryableFailure) return Response.json({ received: false, retryable: true }, { status: 503 });
return Response.json({ received: true, events: events.length, enqueued });
```

- [ ] **Step 5: Add tenant-scoped diagnostics repository and route**

Add `listOutboundDeliveryProblems(workspaceId: string, limit: number): Promise<OutboundDeliveryRecord[]>` filtering states `FAILED` and `UNKNOWN`, newest first, limit capped at 100. The route uses `getValidatedSession`, returns only the session workspace, and never returns normalized payloads or recipient IDs.

- [ ] **Step 6: Render concise diagnostics**

Show kind, automation/broadcast reference, state, attempt count, timestamp, and sanitized last error. Label `UNKNOWN` as “Needs review” and `FAILED` as “Retry pending”; do not add a manual resend button in this release.

- [ ] **Step 7: Run webhook and diagnostics tests**

Run: `pnpm vitest run app/api/meta/webhook/route.test.ts app/api/automations/deliveries/route.test.ts src/components/delivery-diagnostics.test.tsx src/lib/automation/runner.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit fallback and diagnostics behavior**

```bash
git add app/api/meta/webhook/route.ts app/api/meta/webhook/route.test.ts app/api/automations/deliveries src/components/delivery-diagnostics.tsx src/components/delivery-diagnostics.test.tsx src/components/automations-screen.tsx src/lib/automation/runner.ts src/lib/automation/runner.test.ts src/lib/repository.ts src/lib/memory-repository.ts src/lib/prisma.ts
git commit -m "fix: expose ambiguous automation deliveries"
```

### Task 10: Verify and deploy Release 2

**Files:**
- Modify: `e2e/smoke.spec.ts`
- Modify: `ops/COOLIFY_DEPLOYMENT.md`
- Create: `docs/releases/2026-08-23-automation-reliability-release-2.md`

**Interfaces:**
- Consumes: Tasks 1–9 and Coolify service `alzmminzroqpaftmprqt6lny`.
- Produces: clean migration rehearsal, full automated evidence, deployed ledger/quota workers, controlled tester-account replay verification, and a redacted release record.

- [ ] **Step 1: Add end-to-end delivery diagnostics and state-flow tests**

```ts
test("automation delivery problems are visible without recipient payloads", async ({ page }) => {
  await page.goto("/automations");
  await expect(page.getByText("Needs review")).toBeVisible();
  await expect(page.getByText(/recipientId|payload/)).toHaveCount(0);
});

test("classic, campaign, sequence, and broadcast setup remain usable", async ({ page }) => {
  await createAndPauseClassic(page);
  await createAndPauseCampaign(page);
  await createAndUnlinkSequence(page);
  await createEmptyBroadcast(page);
});
```

- [ ] **Step 2: Rehearse migrations on clean and upgraded PostgreSQL 17 databases**

```bash
docker compose -f docker-compose.production.yml up -d postgres
DATABASE_URL="$CLEAN_TEST_DATABASE_URL" pnpm db:migrate:deploy
DATABASE_URL="$UPGRADED_TEST_DATABASE_URL" pnpm db:migrate:deploy
```

Expected: both histories apply without manual SQL; Prisma reports no pending migration afterward. Use dedicated disposable database URLs, never production.

- [ ] **Step 3: Run the complete local quality gate**

Run: `pnpm check:branding && pnpm check:compose && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

Expected: every command exits 0; Vitest, Next build, worker bundle, and Playwright all pass.

- [ ] **Step 4: Commit verification coverage and deployment documentation**

```bash
git add e2e/smoke.spec.ts ops/COOLIFY_DEPLOYMENT.md docs/releases/2026-08-23-automation-reliability-release-2.md
git commit -m "test: gate automation reliability release two"
```

- [ ] **Step 5: Back up production and apply the ledger migration**

Run from the protected production operator shell without printing credentials:

```bash
pg_dump --format=custom --file=replyconnect-before-reliability-r2.dump "$DATABASE_URL"
pnpm db:migrate:deploy
```

Expected: backup exits 0; Prisma applies `20260823200000_outbound_delivery_ledger` and reports no failed migration.

- [ ] **Step 6: Push and deploy the verified commit**

```bash
git status --short
git push origin main
```

Wait for CI and production image publication. Redeploy only Coolify service `alzmminzroqpaftmprqt6lny` using `ops/COOLIFY_DEPLOYMENT.md`; never expose the Coolify token in commands, output, or documentation.

- [ ] **Step 7: Verify containers, queues, reconciliation, and public health**

```bash
docker compose -f docker-compose.coolify.yml ps
curl --fail --silent --show-error https://alzmminzroqpaftmprqt6lny.200.141.14.225.sslip.io/api/health
```

Expected: `web` is `running:healthy`, `worker` is running, `migrate` exited 0, PostgreSQL and Valkey are healthy, `/api/health` returns 200, worker logs show scheduled sequence and expired-claim reconciliation without repeated crashes.

- [ ] **Step 8: Perform controlled tester-account replay checks**

Using only a dedicated Meta tester account, deliver one classic two-action flow, one follow-gated campaign, one sequence step, and one broadcast to no more than two tester recipients. Capture the source webhook/job JSON, replay each once, and verify:

```sql
SELECT "deliveryKey", "state", "attemptCount", "providerMessageId"
FROM "OutboundDelivery"
WHERE "createdAt" >= NOW() - INTERVAL '30 minutes'
ORDER BY "createdAt";
```

Expected: each deterministic key has one row; confirmed provider calls remain one per key; replays reuse `SENT`; broadcast counters converge; no `UNKNOWN` exists unless the test intentionally injects an ambiguous failure.

- [ ] **Step 9: Record and commit deployment evidence**

Record timestamps, commit SHA, backup artifact name, migration result, container status, health response, tester-only delivery keys, provider-call counts, and redacted screenshots/log excerpts in `docs/releases/2026-08-23-automation-reliability-release-2.md`.

```bash
git add docs/releases/2026-08-23-automation-reliability-release-2.md
git commit -m "docs: record release two deployment evidence"
git push origin main
```
