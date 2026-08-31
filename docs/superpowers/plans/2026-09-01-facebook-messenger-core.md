# Facebook Messenger Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents; execute inline.

**Goal:** Implement and test complete Facebook Messenger automation without allowing unapproved production sends.

**Architecture:** Extend contacts and deliveries with provider-scoped identity, add a durable server-enforced Messenger rollout state, normalize Messenger webhook events into a separate queue, and execute them through a Messenger-specific runner and client. Templates and builder surfaces exist in code but are exposed only when the rollout service authorizes the workspace.

**Tech Stack:** Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5.9.3, Prisma 6.19.3, PostgreSQL, Zod 4.4.3, Vitest 4.1.11, Playwright 1.62.1, BullMQ/Redis, Meta Messenger Platform.

**Spec:** `docs/superpowers/specs/2026-09-01-facebook-automation-parity-design.md`

**Prerequisite:** Complete `docs/superpowers/plans/2026-09-01-facebook-channel-foundation-page-comments.md` first.

## Global Constraints

- Read the relevant Next.js 16 documentation in `node_modules/next/dist/docs/` before changing route handlers or server/client component boundaries.
- Follow red-green-refactor and commit after each task.
- Production default is `OFF`. No environment fallback, UI flag, direct API call, webhook, queue retry, or runner invocation may bypass the persisted rollout decision.
- `INTERNAL` permits only explicitly allowlisted workspace IDs. `ENABLED` still requires healthy Page permissions and webhook subscriptions.
- Page-comment activity never creates Messenger eligibility. Every send rechecks opt-out, suppression, connection health, rollout, and eligibility immediately before delivery.
- Store only sanitized permission names and safe error metadata. Tokens are loaded from the encrypted connection at send time and never stored in contacts, delivery payloads, jobs, activity, or logs.

---

### Task 1: Make contacts and outbound deliveries provider-addressable

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901100000_channel_contacts_deliveries/migration.sql`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/automation/outbound-delivery.ts`
- Test: `src/lib/automation/outbound-delivery.test.ts`
- Create: `src/lib/automation/contact-repository.test.ts`
- Modify: `src/lib/migration-history.test.ts`

**Interfaces:**

```ts
export type ProviderContactKey = {
  workspaceId: string;
  provider: "INSTAGRAM" | "FACEBOOK";
  connectionId: string;
  providerUserId: string;
};
```

- [ ] **Step 1: Write failing migration and repository tests**

Prove deterministic Instagram backfill, canonical uniqueness `(workspaceId, provider, connectionId, providerUserId)`, Page-scoped Facebook identity isolation, and delivery-key isolation by provider/connection. Add cases for `messagingEligibleUntil`, `lastOptInAt`, `optInType`, and `optedOutAt`.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/automation/contact-repository.test.ts src/lib/automation/outbound-delivery.test.ts src/lib/migration-history.test.ts`

Expected: FAIL because the channel-addressable fields and repository methods do not exist.

- [ ] **Step 3: Add additive schema and backfill**

Add `provider`, `connectionId`, `providerUserId`, eligibility/opt-in fields to `AutomationContact`; add `provider` and `connectionId` to `OutboundDelivery`; retain `instagramAccountId` and `igScopedUserId`. Backfill Instagram rows and create canonical unique/index constraints only after checking for duplicate legacy data in migration SQL.

- [ ] **Step 4: Add target-based repositories**

Implement `findOrCreateProviderContact`, `getProviderContact`, `setMessagingEligibility`, `recordOptOut`, and provider-aware delivery ownership. Keep legacy Instagram wrappers calling the new methods until all callers migrate.

- [ ] **Step 5: Verify and commit**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/automation/contact-repository.test.ts src/lib/automation/outbound-delivery.test.ts src/lib/automation/delivery-repository-concurrency.test.ts src/lib/migration-history.test.ts && pnpm typecheck`

Expected: all commands exit 0.

```bash
git add prisma src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/automation/contact-repository.test.ts src/lib/automation/outbound-delivery.ts src/lib/automation/outbound-delivery.test.ts src/lib/automation/delivery-repository-concurrency.test.ts src/lib/migration-history.test.ts
git commit -m "feat(automation): add provider-scoped contacts and deliveries"
```

### Task 2: Add a fail-closed Messenger rollout service

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901110000_messenger_rollout/migration.sql`
- Create: `src/lib/facebook/messenger-rollout.ts`
- Create: `src/lib/facebook/messenger-rollout.test.ts`
- Modify: `src/lib/automation/channels/registry.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/automations/[id]/route.ts`
- Test: `src/lib/automation/activation-route.test.ts`

**Interfaces:**

```ts
export type MessengerRolloutState = "OFF" | "INTERNAL" | "ENABLED";
export type MessengerAccess = { allowed: boolean; code?: "capability_disabled" | "permission_missing" | "connection_unhealthy" };
export function authorizeMessengerCapability(input: { state: MessengerRolloutState; workspaceId: string; internalWorkspaceIds: readonly string[]; connectionHealth: MessengerConnectionHealth }): MessengerAccess;
```

- [ ] **Step 1: Write the rollout truth table as failing tests**

Cover OFF for all workspaces, INTERNAL only for exact allowlist entries, ENABLED for eligible workspaces, missing permissions, stale permission checks, missing webhook subscriptions, disconnected Pages, draft creation, activation, simulation, version restore, and direct API calls.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/facebook/messenger-rollout.test.ts src/lib/automation/activation-route.test.ts app/api/automations/route.test.ts`

Expected: FAIL because Messenger rollout persistence and authorization do not exist.

- [ ] **Step 3: Persist rollout state and allowlist**

Create one durable platform capability row for `FACEBOOK_MESSENGER`, default `OFF`, with a normalized internal workspace allowlist. Enable RLS with no tenant policies. Missing rows and database failures resolve to OFF.

- [ ] **Step 4: Enforce the service at every write boundary**

Use one server-only authorization function for create, update, duplicate, restore, activate, and simulate. Return the exact stable error code and never infer authorization from hidden UI.

- [ ] **Step 5: Verify and commit**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/facebook/messenger-rollout.test.ts src/lib/automation/activation-route.test.ts app/api/automations/route.test.ts app/api/automations/[id]/duplicate/route.test.ts && pnpm typecheck`

Expected: all tests pass and the default production state is OFF.

```bash
git add prisma src/lib/facebook/messenger-rollout.ts src/lib/facebook/messenger-rollout.test.ts src/lib/automation/channels/registry.ts src/lib/automation/activation-route.test.ts app/api/automations
git commit -m "feat(facebook): enforce Messenger rollout state"
```

### Task 3: Normalize and queue Messenger webhook events

**Files:**
- Create: `src/lib/facebook/messenger-events.ts`
- Create: `src/lib/facebook/messenger-events.test.ts`
- Modify: `src/lib/facebook/webhooks.ts`
- Modify: `app/api/facebook/webhook/route.ts`
- Modify: `src/lib/queue.ts`
- Modify: `src/worker.ts`
- Test: `src/lib/facebook/webhooks.test.ts`
- Test: `app/api/facebook/webhook/route.test.ts`

**Interfaces:**

```ts
export type MessengerInboundEvent =
  | { type: "message"; pageId: string; senderId: string; mid: string; text?: string; timestamp: number }
  | { type: "postback"; pageId: string; senderId: string; mid: string; payload: string; timestamp: number }
  | { type: "referral"; pageId: string; senderId: string; mid: string; ref: string; source: string; timestamp: number }
  | { type: "quick_reply"; pageId: string; senderId: string; mid: string; payload: string; timestamp: number }
  | { type: "optin"; pageId: string; senderId: string; mid: string; optinType: string; timestamp: number };
```

- [ ] **Step 1: Add signed fixture tests**

Cover text, attachment-only message, postback/Get Started, referral, quick reply, supported opt-in, delivery/read/echo suppression, duplicate message IDs, malformed entries, invalid signatures, Page feed coexistence, and cross-Page isolation.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/facebook/messenger-events.test.ts src/lib/facebook/webhooks.test.ts app/api/facebook/webhook/route.test.ts`

Expected: FAIL because Messenger entries are not normalized or queued.

- [ ] **Step 3: Split normalization after shared signature verification**

Keep verification at the route boundary. Route Page feed changes to the existing comment queue and Messenger events to `facebook-messenger-inbound`. Use `{ pageId, mid }` as the idempotency identity and reject Page-authored echoes.

- [ ] **Step 4: Register queue and worker without enabling sends**

The worker calls the Messenger runner, which must independently authorize rollout and connection health. Queue acceptance never implies send authorization.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run src/lib/facebook/messenger-events.test.ts src/lib/facebook/webhooks.test.ts app/api/facebook/webhook/route.test.ts src/lib/queue.broadcast.test.ts && pnpm typecheck`

Expected: all focused tests pass.

```bash
git add src/lib/facebook/messenger-events.ts src/lib/facebook/messenger-events.test.ts src/lib/facebook/webhooks.ts src/lib/facebook/webhooks.test.ts app/api/facebook/webhook src/lib/queue.ts src/worker.ts src/lib/queue.broadcast.test.ts
git commit -m "feat(facebook): queue Messenger webhook events"
```

### Task 4: Add Messenger delivery and connection health

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901120000_facebook_capability_health/migration.sql`
- Modify: `src/lib/facebook/client.ts`
- Create: `src/lib/facebook/messenger-client.test.ts`
- Create: `src/lib/facebook/capability-health.ts`
- Create: `src/lib/facebook/capability-health.test.ts`
- Modify: `app/api/facebook/connection/health/route.ts`
- Test: `app/api/facebook/connection/health/route.test.ts`

- [ ] **Step 1: Write failing client and health tests**

Cover text, image, link, button, quick reply, payload-size validation, recipient Page scoping, Graph error sanitization, granted-permission names, check timestamps, required Messenger permissions, and webhook subscription fields.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/facebook/messenger-client.test.ts src/lib/facebook/capability-health.test.ts app/api/facebook/connection/health/route.test.ts`

Expected: FAIL because Messenger sends and health persistence do not exist.

- [ ] **Step 3: Implement action mapping and sanitized health persistence**

Add `sendMessengerAction(pageAccessToken, recipientId, action)` with a strict discriminated union. Extend `FacebookPageConnection` with sanitized permission names, permission-check time, and subscribed webhook fields. Never persist raw Graph responses or debug tokens.

- [ ] **Step 4: Compute Page-comment and Messenger health independently**

Missing Messenger permission must not make Page comments unhealthy. Return a per-capability DTO with stable missing-permission and missing-subscription names.

- [ ] **Step 5: Verify and commit**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/facebook/client.test.ts src/lib/facebook/messenger-client.test.ts src/lib/facebook/capability-health.test.ts app/api/facebook/connection/health/route.test.ts && pnpm typecheck`

Expected: all tests pass.

```bash
git add prisma src/lib/facebook/client.ts src/lib/facebook/client.test.ts src/lib/facebook/messenger-client.test.ts src/lib/facebook/capability-health.ts src/lib/facebook/capability-health.test.ts app/api/facebook/connection/health
git commit -m "feat(facebook): add Messenger delivery health"
```

### Task 5: Execute Messenger automations safely

**Files:**
- Create: `src/lib/facebook/messenger-runner.ts`
- Create: `src/lib/facebook/messenger-runner.test.ts`
- Modify: `src/lib/automation/definition.ts`
- Modify: `src/lib/automation/engine.ts`
- Modify: `src/lib/automation/runner.ts`
- Modify: `src/lib/automation/postback.ts`
- Test: `src/lib/automation/definition.test.ts`
- Test: `src/lib/automation/field-collection.test.ts`
- Test: `src/lib/automation/postback.test.ts`

- [ ] **Step 1: Write failing runner policy tests**

Cover message, first-contact, default reply, Get Started/postback, referral, quick reply, supported opt-in, keyword matching, field collection, multi-action ordering, execution claims, dedupe, daily limits, suppression, opt-out phrases, expired eligibility, Page isolation, rollout OFF/INTERNAL/ENABLED, permission drift, and send-time rechecks.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/facebook/messenger-runner.test.ts src/lib/automation/definition.test.ts src/lib/automation/field-collection.test.ts src/lib/automation/postback.test.ts`

Expected: FAIL because Messenger definition kinds and runner do not exist.

- [ ] **Step 3: Add the Messenger definition version and adapter**

Introduce only the new version’s trigger kinds and supported actions: text, image, link, button, and quick reply. Preserve v1 interpretation. The Messenger runner creates/updates a Facebook contact only from an eligible Messenger interaction, then delegates channel-neutral policy to shared services and delivery to the Messenger client.

- [ ] **Step 4: Record safe, actionable activity**

Record matched automation, trigger kind, action index, delivery result, eligibility decision, and sanitized provider error. Use `capability_disabled`, `permission_missing`, `connection_unhealthy`, `recipient_ineligible`, and `recipient_opted_out` consistently.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run src/lib/facebook/messenger-runner.test.ts src/lib/automation/definition.test.ts src/lib/automation/engine.test.ts src/lib/automation/field-collection.test.ts src/lib/automation/postback.test.ts src/lib/automation/outbound-delivery.test.ts && pnpm typecheck`

Expected: all focused tests pass.

```bash
git add src/lib/facebook/messenger-runner.ts src/lib/facebook/messenger-runner.test.ts src/lib/automation/definition.ts src/lib/automation/definition.test.ts src/lib/automation/engine.ts src/lib/automation/engine.test.ts src/lib/automation/runner.ts src/lib/automation/field-collection.test.ts src/lib/automation/postback.ts src/lib/automation/postback.test.ts
git commit -m "feat(facebook): execute Messenger automations safely"
```

### Task 6: Add gated Messenger templates, builder, preview, and simulator

**Files:**
- Create: `src/lib/automation/templates/facebook-messenger.ts`
- Modify: `src/lib/automation/templates.ts`
- Modify: `src/lib/automation/channels/registry.ts`
- Create: `src/components/facebook-messenger-preview.tsx`
- Create: `src/components/facebook-messenger-preview.test.tsx`
- Modify: `src/components/automation-builder.tsx`
- Modify: `src/components/template-picker-modal.tsx`
- Modify: `src/lib/automation/simulator.ts`
- Test: `src/lib/automation/templates.test.ts`
- Test: `src/components/automation-builder.test.tsx`
- Test: `src/lib/automation/simulator.test.ts`
- Create: `e2e/facebook-messenger-gate.spec.ts`

- [ ] **Step 1: Write failing template, UI, and direct-API gate tests**

Require conversation starters, keyword instant reply, default reply, main menu, welcome, referral/ad welcome, email capture, lead qualification, FAQ, support triage, follow-up sequence, and eligible subscriber broadcast. Assert OFF hides them for ordinary workspaces and direct create/activate/simulate calls return `capability_disabled`; INTERNAL shows them only to allowlisted workspaces.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/automation/templates.test.ts src/components/automation-builder.test.tsx src/components/facebook-messenger-preview.test.tsx src/lib/automation/simulator.test.ts`

Expected: FAIL because Messenger catalog and UI do not exist.

- [ ] **Step 3: Implement the catalog and truthful local preview**

Add provider/surface requirements to every template. Render a Facebook conversation using only supported action shapes. The simulator runs validation and local transitions without contacting Meta or changing eligibility.

- [ ] **Step 4: Complete gated builder sections**

Expose inbound trigger, action sequence, data collection, follow-ups, sequence enrollment selection, schedule, priority, and limit only when server-provided capability access permits them. Surface missing permission/subscription health without exposing secrets.

- [ ] **Step 5: Run the Messenger-core gate and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm playwright test e2e/facebook-messenger-gate.spec.ts`

Expected: all commands exit 0; E2E proves OFF blocks UI and API, and a controlled INTERNAL fixture can build/simulate without enabling production globally.

```bash
git add src/lib/automation/templates src/lib/automation/templates.ts src/lib/automation/templates.test.ts src/lib/automation/channels/registry.ts src/lib/automation/simulator.ts src/lib/automation/simulator.test.ts src/components/automation-builder.tsx src/components/automation-builder.test.tsx src/components/template-picker-modal.tsx src/components/facebook-messenger-preview.tsx src/components/facebook-messenger-preview.test.tsx e2e/facebook-messenger-gate.spec.ts
git commit -m "feat(facebook): add gated Messenger builder"
```
