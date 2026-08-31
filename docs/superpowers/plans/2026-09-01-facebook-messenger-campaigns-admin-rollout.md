# Facebook Messenger Campaigns and Admin Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents; execute inline.

**Goal:** Finish Facebook Messenger parity with provider-aware contacts, sequences, broadcasts, diagnostics, and owner-controlled rollout operations.

**Architecture:** Bind sequences and broadcasts to a provider and optional connection, recheck Messenger eligibility at every dispatch, expose provider-aware audience tools, and extend the existing owner console with audited rollout, permission, webhook, and failure controls. The final production gate remains OFF until Meta grants Messenger approval.

**Tech Stack:** Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5.9.3, Prisma 6.19.3, PostgreSQL, Zod 4.4.3, Vitest 4.1.11, Playwright 1.62.1, BullMQ/Redis, existing Linkar owner-admin DAL and audit system.

**Spec:** `docs/superpowers/specs/2026-09-01-facebook-automation-parity-design.md`

**Prerequisite:** Complete `docs/superpowers/plans/2026-09-01-facebook-messenger-core.md` first.

## Global Constraints

- Read the relevant Next.js 16 documentation in `node_modules/next/dist/docs/` before changing route handlers or server/client component boundaries.
- Follow red-green-refactor and commit after each task.
- Preserve existing Instagram sequences, broadcasts, contacts, segments, enrollments, and delivery history through additive backfills.
- Enrollment and dispatch must fail closed on provider/connection mismatch. Every Messenger job rechecks rollout, connection, permissions, subscription, suppression, opt-out, and eligibility at send time.
- Only exact allowlisted, AAL2-authenticated platform owners may mutate rollout state. Every attempt and result uses the existing append-only admin audit service and one-time confirmation protections.
- This plan prepares approval and controlled testing; it does not submit Meta App Review or globally enable Messenger.

---

### Task 1: Bind sequences and enrollments to channel targets

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901130000_provider_sequences/migration.sql`
- Modify: `app/api/sequences/route.ts`
- Modify: `app/api/sequences/[id]/route.ts`
- Modify: `src/lib/automation/sequence-runner.ts`
- Modify: `src/components/sequences-screen.tsx`
- Test: `app/api/sequences/route.test.ts`
- Test: `app/api/sequences/[id]/route.test.ts`
- Test: `src/lib/automation/sequence-runner-concurrency.test.ts`
- Test: `src/components/sequences-screen.test.tsx`

- [ ] **Step 1: Write failing compatibility and dispatch tests**

Assert Instagram backfill, required provider on new sequences, optional compatible connection pin, rejection of cross-provider and cross-Page enrollment, supported Messenger action validation, and rechecks for rollout/health/suppression/opt-out/eligibility before every delayed step.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run app/api/sequences/route.test.ts app/api/sequences/[id]/route.test.ts src/lib/automation/sequence-runner-concurrency.test.ts src/components/sequences-screen.test.tsx`

Expected: FAIL because sequences have no provider target.

- [ ] **Step 3: Add provider and connection fields with Instagram backfill**

Add indexed `provider` and optional `connectionId` to `AutomationSequence`. Keep enrollment pointing at `AutomationContact`; enforce compatibility in a transaction before creation and again before each step claim/send.

- [ ] **Step 4: Add channel-aware API and UI**

Filter action editors and selectable contacts by sequence target. Display provider/connection badges and explain paused/cancelled Messenger steps with stable policy codes.

- [ ] **Step 5: Verify and commit**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run app/api/sequences/route.test.ts app/api/sequences/[id]/route.test.ts src/lib/automation/sequence-runner-concurrency.test.ts src/components/sequences-screen.test.tsx && pnpm typecheck`

Expected: all tests pass.

```bash
git add prisma app/api/sequences src/lib/automation/sequence-runner.ts src/lib/automation/sequence-runner-concurrency.test.ts src/components/sequences-screen.tsx src/components/sequences-screen.test.tsx
git commit -m "feat(sequences): bind sequences to channel targets"
```

### Task 2: Make broadcasts provider-aware and dispatch-safe

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901140000_provider_broadcasts/migration.sql`
- Modify: `app/api/broadcasts/route.ts`
- Modify: `src/lib/automation/broadcast-runner.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/components/broadcasts-screen.tsx`
- Test: `app/api/broadcasts/route.test.ts`
- Test: `src/lib/automation/broadcast-runner.test.ts`
- Test: `src/lib/broadcast-segments.test.ts`
- Create: `src/components/broadcasts-screen.test.tsx`

**Interfaces:**

```ts
export type BroadcastEligibilitySegment =
  | "all_contacts"
  | "captured_email"
  | "messenger_currently_eligible"
  | "messenger_approved_optin";
```

- [ ] **Step 1: Write failing selection and race-condition tests**

Cover Instagram backfill, provider/connection/action validation, explicit segment compatibility, recipient snapshot at start, Page isolation, dedupe, and a recipient becoming expired, opted out, suppressed, disconnected, or rollout-disabled between selection and dispatch.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run app/api/broadcasts/route.test.ts src/lib/automation/broadcast-runner.test.ts src/lib/broadcast-segments.test.ts src/components/broadcasts-screen.test.tsx`

Expected: FAIL because broadcasts are not provider-bound.

- [ ] **Step 3: Add provider, connection, versioned action, and segment fields**

Backfill existing broadcasts to Instagram while preserving `all_contacts` and `captured_email`. New Messenger broadcasts require a Page pin, supported action payload, and an explicit Messenger eligibility segment.

- [ ] **Step 4: Recheck every recipient at dispatch**

Resolve the current contact, rollout, Page health, permission/subscription state, suppression, opt-out, and eligibility immediately before claiming a delivery. Record policy skips without treating them as provider failures.

- [ ] **Step 5: Verify and commit**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run app/api/broadcasts/route.test.ts src/lib/automation/broadcast-runner.test.ts src/lib/broadcast-segments.test.ts src/components/broadcasts-screen.test.tsx src/lib/queue.broadcast.test.ts && pnpm typecheck`

Expected: all tests pass.

```bash
git add prisma app/api/broadcasts src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/automation/broadcast-runner.ts src/lib/automation/broadcast-runner.test.ts src/lib/broadcast-segments.test.ts src/components/broadcasts-screen.tsx src/components/broadcasts-screen.test.tsx src/lib/queue.broadcast.test.ts
git commit -m "feat(broadcasts): enforce channel eligibility"
```

### Task 3: Add provider-aware audience and contact operations

**Files:**
- Modify: `app/api/contacts/route.ts`
- Modify: `app/api/contacts/export/route.ts`
- Modify: `src/lib/client/workspace-data.ts`
- Modify: `src/components/automations-screen.tsx`
- Modify: `src/components/contact-detail-modal.tsx`
- Test: `app/api/contacts/export/route.test.ts`
- Create: `app/api/contacts/route.test.ts`
- Create: `src/components/automations-screen.test.tsx`
- Create: `src/components/contact-detail-modal.test.tsx`

- [ ] **Step 1: Write failing privacy and filtering tests**

Cover provider, surface, and connection filters; workspace/Page isolation; exact export scope; Messenger eligibility/opt-in/opt-out display; and absence of tokens, raw provider payloads, or internal identifiers from DTOs.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run app/api/contacts/route.test.ts app/api/contacts/export/route.test.ts src/components/automations-screen.test.tsx src/components/contact-detail-modal.test.tsx`

Expected: FAIL because contacts are exposed through Instagram-only shapes.

- [ ] **Step 3: Implement channel-aware DTOs and filters**

Return provider, connection display name, safe provider user reference, contact fields, suppression, opt-out, eligibility state, and relevant timestamps. Preserve existing Instagram exports and make provider scope explicit in filenames and column headings.

- [ ] **Step 4: Add audience UI controls**

Add provider/connection filters and status chips. Messenger contacts show why they are eligible or blocked; comment-only users are never shown as Messenger contacts.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run app/api/contacts/route.test.ts app/api/contacts/export/route.test.ts src/components/automations-screen.test.tsx src/components/contact-detail-modal.test.tsx && pnpm typecheck && pnpm lint`

Expected: all commands exit 0.

```bash
git add app/api/contacts src/lib/client/workspace-data.ts src/components/automations-screen.tsx src/components/automations-screen.test.tsx src/components/contact-detail-modal.tsx src/components/contact-detail-modal.test.tsx
git commit -m "feat(audience): add channel-aware contacts"
```

### Task 4: Add owner-controlled Messenger rollout and diagnostics

**Files:**
- Create: `src/lib/admin/integrations/messenger-rollout.ts`
- Create: `src/lib/admin/integrations/messenger-rollout.test.ts`
- Create: `app/api/admin/integrations/facebook-messenger/route.ts`
- Create: `app/api/admin/integrations/facebook-messenger/route.test.ts`
- Modify: `src/lib/admin/integrations/service.ts`
- Modify: `src/components/admin/integrations/integrations-console.tsx`
- Modify: `src/components/admin/integrations/integrations-console.test.tsx`
- Modify: `src/lib/admin/system/service.ts`
- Modify: `src/components/admin/system/system-console.tsx`

- [ ] **Step 1: Write failing authorization, confirmation, and audit tests**

Cover non-owner rejection, AAL1 rejection, invalid origin, missing reason, stale/used confirmation challenge, OFF/INTERNAL/ENABLED transitions, normalized allowlist entries, production ENABLED precondition failures, disable-from-any-state, before/after audit snapshots, and audit failure handling.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/admin/integrations/messenger-rollout.test.ts app/api/admin/integrations/facebook-messenger/route.test.ts src/components/admin/integrations/integrations-console.test.tsx`

Expected: FAIL because the admin rollout operation does not exist.

- [ ] **Step 3: Build the server-only mutation**

Reuse the exact owner UUID allowlist, AAL2 DAL, origin guard, reason requirement, one-time confirmation challenge, transaction, and append-only audit primitives already used by admin mutations. ENABLED requires configured app credentials, granted permissions, subscribed Messenger webhook fields, a recent successful health check, and at least one controlled INTERNAL smoke result. OFF must remain immediately available as a kill switch.

- [ ] **Step 4: Build the owner-console surface**

Show rollout state, internal workspace allowlist, required versus granted permissions, webhook subscription health, last checks, recent safe delivery failures, and affected workspaces. Never render secrets or raw Graph payloads.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run src/lib/admin/integrations/messenger-rollout.test.ts app/api/admin/integrations/facebook-messenger/route.test.ts src/lib/admin/integrations/service.test.ts src/components/admin/integrations/integrations-console.test.tsx src/lib/admin/system/service.test.ts src/components/admin/system/system-console.test.tsx && pnpm typecheck`

Expected: all tests pass.

```bash
git add src/lib/admin/integrations app/api/admin/integrations/facebook-messenger src/components/admin/integrations src/lib/admin/system/service.ts src/components/admin/system/system-console.tsx src/components/admin/system/system-console.test.tsx
git commit -m "feat(admin): control Messenger rollout"
```

### Task 5: Prepare controlled reviewer operation without submitting App Review

**Files:**
- Create: `docs/operations/facebook-messenger-internal-rollout.md`
- Create: `docs/operations/facebook-messenger-review-checklist.md`
- Create: `src/lib/facebook/review-readiness.ts`
- Create: `src/lib/facebook/review-readiness.test.ts`
- Modify: `app/help/page.tsx`
- Create: `e2e/facebook-messenger-internal.spec.ts`

- [ ] **Step 1: Write failing readiness tests**

Require rollout INTERNAL, exact reviewer workspace allowlist, app credentials configured, Page connected, required permissions granted, webhook subscription healthy, privacy policy/data deletion URLs present, test user/Page references present, and successful recent fixtures for message, postback, referral, quick reply, opt-out, sequence, and broadcast.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/facebook/review-readiness.test.ts`

Expected: FAIL because readiness aggregation does not exist.

- [ ] **Step 3: Implement a read-only readiness report**

Return named checks with `pass | fail | blocked`, safe remediation text, and timestamps. Do not perform external mutations, submit review, upload screencasts, create test accounts, or change rollout state.

- [ ] **Step 4: Document and exercise INTERNAL operation**

The runbook must cover allowlisting, fixture processing, eligibility checks, opt-out, sequence/broadcast rechecks, activity inspection, failure recovery, OFF kill switch, and evidence collection. The Playwright test follows the same controlled workflow with mocked Meta endpoints.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run src/lib/facebook/review-readiness.test.ts && pnpm playwright test e2e/facebook-messenger-internal.spec.ts && pnpm typecheck`

Expected: all commands exit 0; the readiness report clearly states that App Review submission and global enablement have not occurred.

```bash
git add docs/operations/facebook-messenger-internal-rollout.md docs/operations/facebook-messenger-review-checklist.md src/lib/facebook/review-readiness.ts src/lib/facebook/review-readiness.test.ts app/help/page.tsx e2e/facebook-messenger-internal.spec.ts
git commit -m "docs(facebook): prepare Messenger review operations"
```

### Task 6: Run the complete cross-channel release gate

**Files:**
- Modify: `docs/operations/facebook-messenger-internal-rollout.md`
- Modify: `docs/superpowers/plans/2026-09-01-facebook-messenger-campaigns-admin-rollout.md`

- [ ] **Step 1: Verify migration safety on a production-shaped snapshot**

Run the migration in a disposable database seeded with existing Instagram automations, contacts, sequences, broadcasts, enrollments, deliveries, and Facebook Page connections. Confirm row counts and historical foreign keys are unchanged, and record the exact verification commands/results in the runbook.

- [ ] **Step 2: Run all automated checks**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm test:e2e`

Expected: every command exits 0.

- [ ] **Step 3: Run failure and isolation smoke cases**

With Meta endpoints stubbed, verify Instagram automation, Facebook Page public reply, Messenger OFF rejection, Messenger INTERNAL allowlisted success, non-allowlisted rejection, Page permission drift, webhook subscription drift, opt-out, expired eligibility, and OFF kill switch. Confirm no case crosses workspace or Page boundaries.

- [ ] **Step 4: Confirm the production posture**

Read the persisted production capability state and verify `FACEBOOK_MESSENGER=OFF`. Confirm Page comments remain available, no Messenger jobs are waiting/running, and the owner console reports why Messenger cannot send.

- [ ] **Step 5: Mark the plan complete and commit evidence**

Check every completed box only after its command succeeds. Add a dated verification section to the runbook with commit SHA, migration version, test totals, build result, and confirmed production rollout state.

```bash
git add docs/operations/facebook-messenger-internal-rollout.md docs/superpowers/plans/2026-09-01-facebook-messenger-campaigns-admin-rollout.md
git commit -m "test(facebook): verify Messenger release gates"
```
