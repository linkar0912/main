# Automation Reliability Audit Design

## Goal

Make every Linkar automation surface secure after session revocation, tenant-safe,
observable, and resistant to duplicate or lost delivery across retries, worker
restarts, concurrent schedulers, queue failures, and partial database failures.

The work covers classic automations, follow-gated campaigns, sequences,
broadcasts, activity analytics, lead capture, outbound lead webhooks, the Meta
webhook ingress path, repositories, BullMQ jobs, and production deployment.

## Confirmed defects

The audit reproduced or traced these defects against commit `7acb0f8`:

1. Sequence and broadcast mutations accept revoked cookies. Several automation
   reads and activity routes also continue exposing data after revocation.
2. Correctly signed legacy tokens without a session ID bypass revocation and
   token-version checks.
3. A retryable failure on a later classic action resends earlier successful
   actions.
4. Email-capture state advances before its confirmation or next question is
   durably delivered, so a transient failure can lose the follow-up and replay
   the original automation.
5. Concurrent sequence sweeps send the same due step more than once.
6. Sequence source automation links cannot be cleared through the UI or API.
7. Broadcast job IDs collide for the same scoped user on different Instagram
   accounts.
8. A partially failed broadcast enqueue can mark already queued recipients as
   failed and later over-count delivery.
9. A provider success followed by a persistence failure can make broadcast or
   sequence retries send the same message again.
10. Follow-gated definitions accept required gates with empty prompt/button
    fields.
11. Classic message keyword definitions accept empty keyword lists.
12. Daily limits count event execution rows rather than actual outbound Meta
    sends and are non-atomic under worker concurrency.
13. Classic email-capture hides lead-webhook and custom-question controls unless
    fulfillment email is enabled, despite those features being independent.
14. Sequence load failures render as a false empty state.
15. Activity charts, top-media data, and CSV export include participants from
    other automations.
16. Activity funnel totals truncate after 10,000 participants.
17. Inline webhook execution without Redis acknowledges retryable failures with
    HTTP 200, preventing Meta redelivery.
18. Lead webhooks treat HTTP errors as success and are fire-and-forget.
19. Queue data deletion does not recognize broadcast jobs because their account
    field is named differently.
20. Deleting one Instagram account can remove sibling-account workspace data.
21. Fallback webhook IDs collide for multiple identifier-less events sharing a
    timestamp.
22. Instagram-account lookup is ambiguous when the same account is connected to
    multiple workspaces.
23. Sequence enrollment accepts mismatched workspace, sequence, and contact IDs.
24. Tenant lead-webhook protection blocks literal private IPs but does not check
    resolved DNS addresses or redirected destinations.
25. Malformed automation PATCH JSON can escape as a server error instead of a
    structured 400 response.

## Selected approach

Use two releases built around one shared outbound-delivery ledger.

The rejected alternatives are:

- Patch each runner independently. This is quicker but leaves four subtly
  different retry contracts and does not solve the provider-success/database-
  failure ambiguity consistently.
- Rewrite all delivery as a new workflow engine. This could be cleaner long
  term, but it is a high-risk replacement of working campaign state machines and
  is not necessary to fix the audited failures.

The shared ledger is the smallest reusable boundary that fixes duplicate sends
without replacing trigger matching or campaign state logic.

## Release 1: security and deterministic correctness

Release 1 contains changes that do not depend on the new delivery ledger.

### Session boundary

- Every authenticated automation, activity, sequence, broadcast, insight, and
  export route uses `getValidatedSession`, including reads.
- `validateSessionState` rejects tokens without both `sid` and `ver`. Old-format
  tokens are logged out and must authenticate again.
- Mutation tests prove rejection occurs before repository or queue work.

### Definition and route validation

- V2 definitions require non-empty `notFollowingMessage` and
  `recheckButtonLabel` whenever `followGate.required` is true.
- V1 message keyword triggers require at least one normalized keyword; any-
  message triggers reject non-empty keyword arrays, matching comment behavior.
- Automation names are trimmed and limited to 120 characters in POST and PATCH.
- Malformed JSON returns a structured 400 response.

### Sequence correctness

- Sequence PATCH represents source removal explicitly with
  `sourceAutomationId: null`.
- The Zod patch schema, route, memory repository, Prisma repository, and UI use
  the same nullable contract.
- Enrollment verifies that the sequence and contact both exist in the requested
  workspace before creating a row.
- The production schema adds composite tenant keys so an enrollment cannot
  reference a sequence or contact from another workspace.

### Broadcast queue correctness

- Broadcast job identity is
  `broadcast:{broadcastId}:{igAccountId}:{igScopedUserId}`.
- `enqueueBroadcastSends` uses settled results and returns exact accepted and
  rejected recipient keys. One failed add cannot erase knowledge of successful
  adds.
- The route records only rejected recipients as failed.
- Queue deletion matches both ordinary webhook `accountId` and broadcast
  `igAccountId` payloads.

### UI and analytics

- Lead webhook and custom-question controls remain visible whenever email
  capture is enabled. Fulfillment-email fields alone depend on the delivery
  checkbox.
- Sequence fetches check both response statuses and render actionable alerts.
- Insights time series, funnel, top media, and CSV export accept and enforce one
  optional `automationId` filter. Activity pages always pass their automation
  ID.
- Funnel totals use repository aggregation instead of loading a capped participant
  list.

### Webhook ingress and account ownership

- Identifier-less webhook event IDs include a hash of stable event content in
  addition to account and timestamp.
- Instagram account IDs become globally unique across workspaces. OAuth refuses
  an account already owned by another workspace with a clear conflict response.
- The migration is preceded by a production duplicate-account query. Deployment
  stops before migration if any duplicate exists; no account is reassigned or
  deleted automatically.
- Account deletion removes only data directly scoped to the target account. It
  removes workspace-wide automations/settings only when the workspace has no
  remaining Instagram connections.

## Release 2: outbound delivery integrity

### Outbound delivery ledger

Add an `OutboundDelivery` record with:

- globally unique deterministic `deliveryKey`;
- `workspaceId`, kind, recipient/account identifiers, and optional automation,
  participant, sequence-enrollment, or broadcast references;
- state `PENDING`, `CLAIMED`, `SENT`, `FAILED`, or `UNKNOWN`;
- claim expiry, attempt count, provider message ID, last error, created/updated
  timestamps, and sent timestamp;
- the normalized outbound payload needed to retry the exact originally planned
  message even if an automation is edited later.

Repository operations expose these contracts:

- `ensureOutboundDelivery(input)` creates or returns the deterministic record.
- `claimOutboundDelivery(deliveryKey, leaseUntil)` atomically changes PENDING or
  safely retryable FAILED work to CLAIMED and returns whether this caller owns it.
- `completeOutboundDelivery(deliveryKey, providerMessageId)` marks SENT.
- `failOutboundDelivery(deliveryKey, error, retryable)` marks FAILED.
- `markOutboundDeliveryUnknown(deliveryKey, error)` records ambiguous outcomes
  that must never be resent automatically.
- `listExpiredDeliveryClaims(now)` supports reconciliation without guessing that
  an ambiguous provider call failed.

Delivery keys are:

- classic action: `automation:{automationId}:event:{eventId}:action:{index}`;
- email-capture follow-up:
  `automation:{automationId}:event:{eventId}:capture:{stage}`;
- campaign send: existing participant dispatch key mapped into the ledger;
- sequence step: `sequence:{enrollmentId}:step:{stepId}`;
- broadcast recipient:
  `broadcast:{broadcastId}:{igAccountId}:{igScopedUserId}`;
- lead email/webhook:
  `lead:{contactId}:automation:{automationId}:{channel}:{stage}`.

### Delivery semantics

- A successful ledger row is never sent again. If downstream state advancement
  failed, a retry observes SENT and completes the state transition only.
- Explicit Meta rejection responses may be retried when classified retryable.
- Network/status-zero failures and expired CLAIMED rows are ambiguous. They
  become UNKNOWN and are not auto-retried because the provider may already have
  accepted the message.
- UNKNOWN deliveries remain visible in diagnostics for deliberate operator
  resolution. Safety favors one missing message over duplicate outreach.
- V1 multi-action retries claim and complete each indexed action separately.
  Earlier SENT actions are skipped and only the failed action resumes.
- Email capture sends/records its confirmation or next question through the
  ledger, then finalizes contact state and fulfillment. A retry resumes the first
  incomplete transition without replaying the triggering automation.
- Sequence sweeps may read the same due enrollment concurrently, but only one
  worker can claim the deterministic step delivery. A SENT step advances the
  enrollment without another Meta call.
- Broadcast counters are derived from recipient delivery states. Reconciliation
  makes aggregate counters converge after worker/database interruptions.

### Atomic daily send quotas

Add an `AutomationDailySendCounter` keyed by automation and UTC date.
`claimAutomationSendSlots(automationId, date, amount, limit)` atomically reserves
the exact number of planned outbound Meta messages without exceeding the limit.
UNKNOWN attempts consume a slot because they may have reached Meta. Unused slots
from definitively failed pre-send claims are released.

Every classic action and campaign dispatch claims its slot immediately before
delivery. Limits therefore measure outbound messages, not webhook events.

### Lead webhook delivery and SSRF controls

- Lead webhook and fulfillment work runs as durable queue jobs backed by the
  outbound ledger rather than detached promises.
- Webhook delivery treats non-2xx responses as failures and retries only the
  configured finite attempt budget.
- Each request validates the literal host, resolves every A/AAAA address, blocks
  private/loopback/link-local/multicast/metadata ranges, disables automatic
  redirects, and revalidates every redirect target before following it.
- A maximum of three redirects and a five-second request timeout apply.

### Inline webhook fallback

When Redis is absent, retryable runner errors return HTTP 503 so Meta can
redeliver. Deterministic delivery keys keep the fallback safe when the same event
arrives again. Permanent validation failures are acknowledged and logged without
retry loops.

## Test strategy

Every production change starts with a test that fails for the audited symptom.

### Route tests

- revoked, logout-all, legacy-token, unauthenticated, malformed-body,
  cross-workspace, and success cases for every automation/sequence/broadcast/
  activity/insight/export route;
- assertions that rejected mutations perform no repository or queue work;
- sequence source clearing and tenant-consistent enrollment;
- automation-scoped analytics and CSV data.

### Component tests

- classic email capture exposes webhook/questions without fulfillment email;
- sequences show API errors and clear enrollment sources;
- campaign activity requests scoped insights/export URLs;
- action buttons remain pending-safe and report failures.

### Runner and concurrency tests

- two concurrent V1 jobs do not duplicate indexed actions;
- later-action retry skips earlier SENT actions;
- email capture resumes confirmation and field questions;
- two concurrent sequence sweeps produce one provider call;
- provider success followed by state-transition failure does not resend;
- ambiguous Meta failures become UNKNOWN without automatic retry;
- daily caps hold under concurrent multi-action events;
- broadcast jobs for different accounts remain distinct;
- partial queue enqueue preserves successful recipient accounting;
- inline webhook fallback returns 503 for retryable failures.

### Repository and database tests

- memory/Prisma parity for all new ledger and quota operations;
- atomic claims under concurrency;
- composite workspace integrity for enrollments;
- globally unique Instagram account ownership;
- broadcast counter reconciliation from delivery rows;
- migration history lint and PostgreSQL 17 migration on both an existing schema
  and a clean schema.

### End-to-end tests

- create, edit, activate, pause, duplicate, and delete classic and campaign flows;
- create/edit/unlink/activate/pause/delete sequences;
- launch an empty and a queued broadcast with progress rendering;
- activity page isolation and export scoping;
- desktop and mobile error states for the automation surfaces.

Real Meta acceptance remains a controlled tester-account check because automated
tests must not send production Instagram messages.

## Deployment strategy

### Release 1

1. Run the full unit, component, route, type, lint, build, worker-bundle, and E2E
   suites.
2. Back up production PostgreSQL.
3. Query for duplicate `InstagramConnection.igUserId` values. Stop if any exist.
4. Apply the tenant-integrity/account-uniqueness migration against PostgreSQL 17.
5. Push `main`, wait for CI and the production image workflow, restart only
   ReplyConnect service `alzmminzroqpaftmprqt6lny`, and recover with `/start` if
   Coolify leaves the compose stack exited.
6. Require `web: running:healthy`, `worker: running:unknown`, `migrate: exited`,
   and healthy PostgreSQL/Valkey, then verify the external health endpoint and
   release-specific assets/API behavior.

### Release 2

1. Back up PostgreSQL again.
2. Apply the ledger/quota migration against a copy of the production migration
   history before production.
3. Deploy through the same CI/container/Coolify path.
4. Verify ledger claims, queue health, worker logs, sequence reconciliation,
   broadcast reconciliation, and scoped analytics.
5. Run one controlled classic automation, one campaign, one sequence step, and
   one small tester-only broadcast. Replay their webhook/job inputs and confirm
   provider calls are not duplicated.

Rollback never deletes new ledger or quota data. The previous image may ignore
additive tables, but a rollback occurs only after confirming its older runner
cannot resend deliveries already marked SENT by the new release.

## Non-goals

- Replacing the existing trigger matcher or campaign participant state machine.
- Adding AI-generated replies, scraping, cold outreach, or new Meta permissions.
- Automatically merging or deleting duplicate Instagram-account ownership.
- Claiming exactly-once delivery when Meta does not provide an idempotency key.
  The system instead provides durable at-most-once handling for ambiguous calls
  and exactly-once local state transitions for confirmed calls.
