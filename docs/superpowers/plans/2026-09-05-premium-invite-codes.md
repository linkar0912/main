# Premium Invite Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give workspace owners a secure one-time code that grants Agency access for 30 days without modifying their Razorpay subscription.

**Architecture:** Store hashed admin-generated codes and immutable redemption grants. Resolve an unexpired grant as an overlay in the central entitlement service, expose owner redemption through billing settings, and manage code creation/revocation in the operator Plans area.

**Tech Stack:** Next.js 16 Route Handlers, React 19, TypeScript, Prisma/Postgres, Node crypto, existing admin audit/rate-limit infrastructure, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-05-premium-invite-codes-design.md`

## Global Constraints

- Agency access lasts exactly 30 days.
- Plaintext codes are returned once and never stored or logged.
- Codes are single-use and redemption is owner-only and rate-limited.
- Promotional access never mutates or cancels Razorpay billing.
- Expiry falls back to the base entitlement automatically.

---

### Task 1: Promotional code and redemption schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260905_premium_invite_codes/migration.sql`
- Test: `src/lib/premium-invites/schema.test.ts`

**Interfaces:**
- `PremiumInviteCode` owns one optional single-use redemption.
- `PremiumInviteRedemption` records workspace, user, plan, `startsAt`, and `expiresAt`.

- [ ] Write a failing migration contract test for keys, unique redemption, foreign keys, and active-grant indexes.
- [ ] Run it and confirm the new schema is absent.
- [ ] Add Prisma models and explicit SQL migration with indexed foreign keys.
- [ ] Generate the Prisma client and run the migration contract test.
- [ ] Commit the schema.

### Task 2: Secure invite service and entitlement overlay

**Files:**
- Create: `src/lib/premium-invites/service.ts`
- Create: `src/lib/premium-invites/repository.ts`
- Create: `src/lib/premium-invites/service.test.ts`
- Modify: `src/lib/entitlements/repository.ts`
- Modify: `src/lib/entitlements/memory-repository.ts`
- Modify: `src/lib/entitlements/service.ts`
- Modify: `src/lib/entitlements/service.test.ts`

**Interfaces:**
- `createPremiumInviteService(...).createCode()`, `.revokeCode()`, `.redeemCode()` and `.listCodes()`.
- Entitlement config includes optional `promotion: { plan, expiresAt }`.

- [ ] Add failing tests for hashing, normalization, expiry, revocation, single use, active-grant rejection, and base-plan fallback.
- [ ] Confirm failures before implementation.
- [ ] Implement secure generation and serializable redemption without provider calls.
- [ ] Overlay active Agency grants in effective entitlements and expose expiry metadata.
- [ ] Run service and entitlement tests and commit.

### Task 3: Owner redemption API and billing UI

**Files:**
- Create: `app/api/billing/invite-code/route.ts`
- Create: `app/api/billing/invite-code/route.test.ts`
- Modify: `src/components/billing-settings.tsx`
- Modify: `src/components/billing-settings.test.tsx`
- Modify: `src/lib/billing/service.ts`
- Modify: `src/lib/billing/repository.ts`
- Modify: `app/globals.css`

**Interfaces:**
- `POST /api/billing/invite-code` accepts `{ code: string }` and returns `{ planName, expiresAt }`.
- Billing GET returns `effectivePlanKey` and optional `promotionExpiresAt` while retaining subscription data.

- [ ] Add failing API tests for owner authorization, invalid input, rate limiting, and private headers.
- [ ] Add failing UI tests for redemption and active promotional copy.
- [ ] Implement the API, rate limit, popup feedback, and billing refresh.
- [ ] Run focused API/UI tests and commit.

### Task 4: Admin code management

**Files:**
- Create: `app/api/admin/plans/invite-codes/route.ts`
- Create: `app/api/admin/plans/invite-codes/[id]/route.ts`
- Create: `app/api/admin/plans/invite-codes/route.test.ts`
- Create: `src/components/admin/invite-codes-panel.tsx`
- Create: `src/components/admin/invite-codes-panel.test.tsx`
- Modify: `app/admin/plans/page.tsx`
- Modify: `src/components/admin/plans-screen.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Admin POST creates a code and returns plaintext once; DELETE/PATCH revokes an unused code.
- Admin list returns identifiers, labels, dates, and status only.

- [ ] Add failing route tests for audited create/list/revoke and no plaintext leakage.
- [ ] Add failing panel tests for create-copy-once and revocation.
- [ ] Implement audited routes and responsive admin controls.
- [ ] Run focused tests and commit.

### Task 5: Full verification and local QA

**Files:**
- Modify only for scoped defects found during verification.

- [ ] Run invite, entitlement, billing, admin, and schema tests.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm lint`, and `pnpm build`.
- [ ] Verify generated Prisma client and migration deployment against a disposable/local database.
- [ ] Test free, paid, promoted, expired, used, revoked, and concurrent redemption cases.
- [ ] Review Billing and Admin Plans at desktop and phone widths in light and dark themes.
- [ ] Fix only reproduced regressions using a failing test first and repeat all checks.

