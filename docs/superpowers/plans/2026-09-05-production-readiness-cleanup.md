# Production Readiness and Test-Account Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Razorpay and worker readiness, preserve evidence about isolated Meta rejections, and safely remove only approved synthetic accounts.

**Architecture:** Deployment secrets remain in Coolify; code only improves bounded readiness and cleanup tooling. Synthetic deletion uses exact hard-coded matchers, read-only inventory, impact digest, existing deletion jobs, AAL2, and an action-time confirmation before irreversible submission.

**Tech Stack:** Next.js, TypeScript, Prisma, Supabase Auth, BullMQ/Valkey, Coolify, Razorpay, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-production-readiness-cleanup-design.md`

## Global Constraints

- Never print, commit, paste into chat, or include secrets in audit reasons.
- Never retry the two non-retryable `PROVIDER_REJECTED` deliveries.
- Preserve every email not matching the three approved exact patterns.
- Never delete an allowlisted platform owner.
- Use permanent-deletion jobs; never direct cascading SQL deletion.
- Require a fresh action-time confirmation after the exact impact preview and before submission.

---

### Task 1: Reproduce and document readiness state

**Files:**
- Modify: `docs/admin-console-operations.md`
- Modify: `.env.example`
- Modify: `scripts/verify-billing-config.test.ts`

**Interfaces:**
- Verifies the nine Razorpay variables, canonical `APP_URL`, and the existing worker heartbeat configuration key identified from `src/lib/admin/system/service.ts`.

- [ ] Add failing preflight tests for the worker heartbeat configuration presence without exposing its value.
- [ ] Run `pnpm vitest run scripts/verify-billing-config.test.ts src/lib/admin/system/service.test.ts`; expect the new readiness assertion to fail.
- [ ] Document the exact variable name and safe deployment procedure; add only an empty/example key to `.env.example`.
- [ ] Run the focused tests; expect PASS.
- [ ] Commit with `git add docs/admin-console-operations.md .env.example scripts/verify-billing-config.test.ts && git commit -m "docs: define production billing readiness"` before changing production.

### Task 2: Configure and verify production readiness

**Files:**
- No repository secret files.
- External state: Coolify web/worker environment and Razorpay dashboard.

**Interfaces:**
- Produces: System console `Razorpay Ready`, Worker `Healthy`, and a signed live subscription lifecycle.

- [ ] In Coolify, verify presence—not values—of `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, six plan IDs, `APP_URL`, and the worker heartbeat variable.
- [ ] Enter missing values directly in Coolify secret storage and configure `https://app.linkar.in/api/razorpay/webhook` in Razorpay; do not expose values in tool output.
- [ ] Redeploy web and worker, then run `pnpm preflight:billing` inside the configured release environment; expect “Razorpay live-mode billing configuration is complete.”
- [ ] Verify `/api/health` remains healthy and Admin → System reports Razorpay and Worker Ready with zero new billing webhook failures.
- [ ] Before confirming payment, obtain the required financial-action confirmation; then perform one owner-controlled low-risk live checkout and verify webhook-confirmed entitlement activation.
- [ ] Record only provider subscription ID, workspace ID, timestamps, and sanitized status in the operator audit trail.

### Task 3: Exact synthetic-account inventory

**Files:**
- Create: `src/lib/admin/deletion/synthetic-accounts.ts`
- Create: `src/lib/admin/deletion/synthetic-accounts.test.ts`
- Modify: `src/lib/admin/deletion/impact.ts`
- Modify: `src/lib/admin/deletion/impact.test.ts`

**Interfaces:**
- Produces: `isApprovedSyntheticEmail(email: string): boolean` and `buildSyntheticAccountInventory()` returning exact user IDs, email, membership count, owned workspace IDs, impact, and digest.

- [ ] Write table-driven failing tests that accept only `owner-<digits>@example.com`, `member-<digits>@example.com`, and `signout-<digits>@example.com`; include near misses such as `owner-real@example.com`, `owner-12@example.org`, `xowner-12@example.com`, and `owner-12+tag@example.com`.
- [ ] Run `pnpm vitest run src/lib/admin/deletion/synthetic-accounts.test.ts src/lib/admin/deletion/impact.test.ts`; expect module-not-found failure.
- [ ] Implement normalization with `trim().toLowerCase()` and three anchored regex literals; paginate `createSupabaseAdminClient().auth.admin.listUsers({ page, perPage: 1000 })`, keep `@example.com` candidates, re-check in application code, join Linkar memberships by Auth user ID, exclude platform owners, and reuse `previewDeletion` for every eligible target.
- [ ] Hash a canonical JSON projection sorted by user ID so preview and submission compare the same digest.
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `git add src/lib/admin/deletion/synthetic-accounts.ts src/lib/admin/deletion/synthetic-accounts.test.ts src/lib/admin/deletion/impact.ts src/lib/admin/deletion/impact.test.ts && git commit -m "feat: inventory synthetic accounts safely"`.

### Task 4: Bounded bulk cleanup API and UI

**Files:**
- Create: `app/api/admin/deletions/synthetic/preview/route.ts`
- Create: `app/api/admin/deletions/synthetic/preview/route.test.ts`
- Create: `app/api/admin/deletions/synthetic/route.ts`
- Create: `app/api/admin/deletions/synthetic/route.test.ts`
- Modify: `src/components/admin/deletions/deletion-console.tsx`
- Modify: deletion console/wizard tests.

**Interfaces:**
- Preview response: `{ count, users, ownedWorkspaceCount, impactTotals, digest, challenge }`.
- Submit request: `{ digest, challenge, confirmationPhrase, reason }`; no regex or arbitrary filter input.
- Submit enqueues existing deletion jobs in ownership-safe order.

- [ ] Write failing route tests for AAL2, platform-owner exclusion, stale digest, expired/single-use challenge, exact phrase, changed email, ownership order, and audit event creation.
- [ ] Run new route and deletion component tests; expect module-not-found/UI failures.
- [ ] Implement preview and submit routes by composing Task 3 inventory with existing deletion service/challenge primitives. Do not delete rows in request handlers.
- [ ] Add a “Synthetic test accounts” panel that shows the exact count, addresses, impact totals, reason field, and confirmation phrase; no editable pattern field exists.
- [ ] Run focused tests; expect PASS.
- [ ] Commit with `git add app/api/admin/deletions/synthetic src/components/admin/deletions/deletion-console.tsx src/components/admin/deletions && git commit -m "feat: add audited synthetic account cleanup"`.

### Task 5: Preview, confirm, execute, and verify deletion

**Files:**
- External production state through Admin → Permanent deletion.
- Update after completion: `docs/admin-console-deletion-runbook.md` with the completed safe bulk procedure, without listing user emails.

**Interfaces:**
- Consumes: Task 4 preview/digest/challenge.
- Produces: zero approved-pattern accounts and preserved genuine accounts.

- [ ] Deploy the tested cleanup flow and verify web/worker health before opening the preview.
- [ ] Generate the production preview; export the exact count, impact totals, and digest without message bodies or credentials.
- [ ] Sample at least ten candidates across all three patterns and five preserved near-miss/genuine accounts; confirm ownership/workspace ordering.
- [ ] Present the exact count and impact to the user and request action-time confirmation. Stop here until confirmation is received.
- [ ] After confirmation, enter the single-use phrase and submit before expiry; monitor jobs through reversible and irreversible stages.
- [ ] Verify failed deletion jobs are zero, search for all three exact patterns returns zero, sampled genuine accounts remain active, queues remain running, and public health is healthy.
- [ ] Update the runbook and commit with `git commit -am "docs: record safe synthetic account cleanup"`.

### Task 6: Final production evidence

**Files:**
- No additional code unless verification exposes a reproducible defect.

**Interfaces:**
- Produces a sanitized handoff containing release, readiness states, delivery-failure conclusion, deletion count, and verification results.

- [ ] Recheck Admin → Operations for delivery failures; record that the two historical rejections were not retried and whether any new failures occurred.
- [ ] Recheck Admin → System for database, Redis, worker, queues, Razorpay, webhook failures, stuck deliveries, and incidents.
- [ ] Run `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm check:compose`; expect all commands to exit 0.
- [ ] Report sanitized evidence only; never include secrets, raw provider payloads, message bodies, or deletion confirmation phrases.
