# Automation Delivery Latency Design

## Objective

Reduce the time between receiving a valid Meta webhook and starting the corresponding provider send without weakening signature verification, workspace suspension checks, delivery idempotency, quota enforcement, or ordered multi-message delivery.

The first production target is a p95 queue wait below 100 ms and p95 internal pre-provider work below 250 ms under normal load. End-to-end provider acknowledgement will be measured separately because Meta controls part of that latency.

## Current Path and Root Cause

The webhook route verifies the request, normalizes events, performs an account lookup and workspace-status lookup, and then enqueues each event. The worker repeats the account and workspace checks before it records activity, loads automations, checks contacts and handoff state, evaluates rules, claims an execution, prepares an outbound-delivery ledger entry, reserves usage, and finally calls Meta.

For a fresh ordinary Instagram DM with one matching automation and one action, the path can perform roughly twenty database statements before the provider request. Additional active automations add sequential execution reads and skipped-execution writes. At the same time, realtime webhook work shares five worker slots with broadcasts, lead deliveries, follow-ups, deletion jobs, and maintenance. There are no stage-level latency measurements, so production cannot currently distinguish queue delay, application database work, and provider delay.

Definition validation is not the primary latency source. HMAC verification, JSON parsing, normalization, Zod checks, and in-memory trigger evaluation remain in place.

## Scope

This change covers Instagram and Facebook webhook ingestion, realtime job scheduling, automation runner query shape, outbound delivery preparation, Meta request deadlines, and latency telemetry.

It does not change automation matching semantics, message copy, the order of actions within one automation, retry counts, scheduled follow-up timing, broadcast pacing, workspace suspension behavior, or monthly/daily limit semantics.

## Architecture

### 1. Stage-level latency telemetry

Every realtime event job will carry an `ingestedAt` timestamp assigned after signature verification and normalization. Worker logs will emit structured durations for queue wait, pre-provider preparation, provider request, and total processing. Provider clients will accept an optional timing callback so the runner can distinguish internal preparation from Meta latency without logging tokens, message bodies, recipient identifiers, or raw payloads.

The admin queue snapshot remains the operational view for backlog size and oldest waiting age. Structured logs are the initial source for p50/p95/p99 calculations; no new metrics vendor or database table is introduced.

### 2. Fast webhook acknowledgement

After signature verification, JSON parsing, and normalization, the webhook route will enqueue normalized events immediately. It will no longer query the account mapping and workspace status before enqueueing. The worker remains the authoritative boundary and checks that the channel is connected and the workspace is active before evaluating or sending.

This preserves security because only correctly signed Meta payloads reach the queue, and it preserves suspension behavior because the worker still checks the latest database state immediately before processing. Unknown account/page events become harmless jobs that exit without delivery.

The no-Redis fallback keeps its current inline behavior, including mapping and workspace validation inside the runner.

### 3. Realtime queue isolation

The existing queue remains one Redis queue in the first implementation, but BullMQ priorities will protect realtime Instagram and Facebook events from broadcasts, lead delivery, follow-ups, deletion work, and maintenance. Realtime events receive the highest priority, interactive follow-ups the next tier, and bulk/maintenance work lower tiers. Existing deterministic job IDs, attempts, backoff, and retention settings remain unchanged.

Separate physical queues are deferred until telemetry shows priority scheduling and concurrency tuning are insufficient. This avoids multiplying Redis connections and deployment processes prematurely.

### 4. Runner query reduction

Repository interfaces will add targeted methods for:

- listing only active automations applicable to a specific Instagram account;
- checking whether the exact workspace/account/sender has a paused participant;
- fetching active Facebook automations for a page using the existing page-specific method.

The Instagram runner will load a contact at most once per event and reuse it for suppression, capture, and contact-tracking decisions. Matching automations will rely on the atomic execution claim as the deduplication boundary instead of performing `hasExecution` immediately before `claimExecution`.

Unmatched automation outcomes will not be written one row at a time before delivery. They will be collected and persisted with a single bulk `createMany(..., skipDuplicates: true)` repository call after the provider-critical portion finishes. Matched, failed, daily-limit, reply-once, and demo-mode outcomes retain explicit execution records because they are operationally meaningful.

### 5. Atomic outbound preparation

The outbound-delivery repository will expose one operation that:

1. returns an existing terminal delivery unchanged;
2. creates or reclaims the delivery ledger row atomically;
3. reserves monthly usage exactly once for a new provider attempt;
4. returns either an owned claim, a terminal result, a busy result, or a quota rejection.

The Prisma implementation will use one database transaction with a bounded number of statements and preserve the unique `deliveryKey` reservation contract. Effective entitlement configuration will be cached in the worker process for 30 seconds per workspace. Cache entries affect only plan configuration lookup; the usage reservation remains authoritative and atomic in Postgres. A suspended workspace is still checked separately for every event.

Daily per-automation send limits remain an atomic database claim. They are only queried when a flow defines `dailySendLimit`.

### 6. Provider deadline

Meta and Facebook requests will use an `AbortSignal.timeout` deadline of 10 seconds unless a shorter caller-provided deadline is supplied. A timeout is classified as an ambiguous provider outcome because the request may have reached Meta. The existing outbound ledger will mark it `UNKNOWN`; it will not blindly retry and risk duplicate delivery.

The 10-second request deadline remains below the 30-second default dispatch lease. Environment validation will reject a dispatch lease that is not greater than the provider deadline plus a five-second persistence margin.

### 7. Concurrency tuning

Worker concurrency remains configurable and defaults to five. This change will not raise it blindly. After telemetry is deployed, concurrency can be increased in production if queue-wait p95 exceeds 100 ms while database and Meta error rates remain healthy.

## Data Flow

1. Meta sends a webhook.
2. The route reads the body, verifies the HMAC signature, parses JSON, and normalizes events.
3. Each normalized event is enqueued with deterministic ID, realtime priority, and ingestion timestamp.
4. The worker records queue wait, resolves the connected channel and active workspace, and loads targeted automation/contact state.
5. In-memory evaluation selects outcomes. The runner atomically claims matched executions.
6. Outbound preparation atomically claims the delivery and reserves monthly usage.
7. The provider request runs under the deadline and records provider duration.
8. The ledger and execution are completed. Non-critical activity and batched unmatched outcomes are persisted without delaying provider start.
9. The worker logs stage durations and the result code.

## Error Handling and Safety

- Invalid signatures and invalid JSON are rejected before enqueueing.
- Unknown channels and inactive workspaces exit silently in the worker.
- Redis enqueue failures continue to use the inline fallback only when the queue is not configured. Actual Redis errors propagate so Meta can redeliver rather than losing events.
- Atomic execution claims and delivery keys remain the duplicate-send boundaries.
- Quota reservation failure prevents the provider call.
- Provider timeouts become `UNKNOWN`, not retryable failures.
- Activity logging and batched unmatched-outcome persistence are best effort and cannot convert a successful provider send into a duplicate retry.
- Logs contain event/job correlation hashes and timings, never access tokens, raw payloads, message text, email addresses, or recipient IDs.

## Testing

Unit and repository tests will verify:

- signed webhook events enqueue without account/workspace repository reads;
- realtime jobs receive higher priority than bulk and maintenance jobs;
- targeted automation and paused-sender queries preserve current filtering behavior;
- one contact read is reused across the Instagram runner;
- matched flows do not call `hasExecution` before their atomic claim;
- unmatched outcomes are bulk persisted after delivery-critical work;
- concurrent outbound preparation produces one owner and one usage reservation;
- terminal, busy, quota-rejected, retryable, permanent, and ambiguous delivery states are preserved;
- provider timeout aborts the request and yields an ambiguous result;
- structured timing logs contain durations but no sensitive payload fields.

The existing automation, queue, webhook, Facebook, outbound-delivery, entitlement, and concurrency suites must continue to pass. Type checking, linting, worker bundling, and the relevant targeted Vitest suites are required before completion.

## Rollout

Ship telemetry and the fast-ingress/priority changes first, then query reduction and atomic outbound preparation. Compare queue-wait and pre-provider p95 before and after each stage. Roll back an individual stage if failure rate, ambiguous deliveries, or usage reconciliation drift increases.

Physical queue separation and additional worker replicas remain follow-up options only if the measured queue delay stays above target after these changes.
