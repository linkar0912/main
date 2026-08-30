# Platform Admin Accounts and Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents; execute inline.

**Goal:** Give the platform owner complete user, workspace, plan, feature, quota, usage, suspension, and session-control capabilities, with limits enforced throughout the customer application and worker.

**Architecture:** Extend tenant identity with stable Supabase user IDs, store reversible Linkar lifecycle state separately from Supabase Auth deletion, and resolve plan templates plus workspace overrides through one EntitlementService. Admin list/detail APIs use a dedicated cross-tenant repository with cursor pagination; customer routes and worker sends continue using tenant-scoped repositories but call shared lifecycle and entitlement guards.

**Tech Stack:** Next.js 16.3.1, React 19.2.8, TypeScript 5.9.3, Supabase Auth Admin API, Prisma 6.19.3, PostgreSQL, Zod 4.4.3, Vitest 4.1.11.

**Spec:** `docs/superpowers/specs/2026-08-31-platform-owner-admin-console-design.md`

## Global Constraints

- Execute only after `2026-08-31-platform-admin-foundation.md` passes its completion gate.
- Linkar-level suspension is reversible; Supabase Auth deletion is not used in this phase.
- Allowlisted platform-owner UUIDs cannot be suspended, banned, removed, or deleted.
- Existing resources are never deleted when a workspace moves to a lower plan; blocked actions return explicit entitlement errors.
- Limits are enforced server-side and in the worker, never only by hidden buttons.
- Admin lists use cursor pagination and DTOs that exclude tokens and secrets.
- New public-schema tables have RLS enabled with no public policies and indexed foreign keys.

---

### Task 1: Add stable user identity and workspace lifecycle schema

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260831130000_admin_account_controls/migration.sql`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `src/lib/auth/provision-workspace.ts`
- Modify: `src/lib/auth/invitations.ts`

**Interfaces:**
- Adds `WorkspaceStatus = ACTIVE | SUSPENDED | DELETION_PENDING`.
- Adds nullable `WorkspaceMember.userId` with uniqueness per `(workspaceId, userId)` so one Supabase user can belong to multiple workspaces.
- Adds `PlatformUserControl` keyed by `userId`.
- Produces `getApplicationAccessState(userId, workspaceId): ApplicationAccessState { userStatus; workspaceStatus; sessionInvalidBefore }`.

- [ ] **Step 1: Write failing repository lifecycle tests**

```ts
it("binds a Supabase user id to a workspace membership", async () => {
  await repository.ensureWorkspace("w1", "owner@linkar.in", "11111111-1111-4111-8111-111111111111");
  expect(await repository.listWorkspaceMembershipsByUserId("11111111-1111-4111-8111-111111111111"))
    .toContainEqual(expect.objectContaining({ workspaceId: "w1", role: "OWNER" }));
});

it("suspends and restores a workspace without deleting tenant data", async () => {
  await repository.setWorkspaceLifecycle("w1", { status: "SUSPENDED", reason: "abuse review", actorUserId: "owner-id", at: NOW });
  expect((await repository.getApplicationAccessState("user-id", "w1"))?.workspaceStatus).toBe("SUSPENDED");
  expect(await repository.listAutomations("w1")).toHaveLength(1);
  await repository.setWorkspaceLifecycle("w1", { status: "ACTIVE", reason: "review complete", actorUserId: "owner-id", at: LATER });
  expect((await repository.getApplicationAccessState("user-id", "w1"))?.workspaceStatus).toBe("ACTIVE");
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/repository.test.ts src/lib/auth/provision-workspace.test.ts src/lib/auth/invitations.test.ts`

Expected: FAIL because stable user IDs and lifecycle methods do not exist.

- [ ] **Step 3: Add schema and migration**

Add the lifecycle fields from the spec to `Workspace`; add `userId String?`, `@@unique([workspaceId, userId])`, and `@@index([userId])` to `WorkspaceMember`; add `PlatformUserControl` with status, suspension fields, `sessionInvalidBefore`, and `updatedAt`.

The migration backfills only schema defaults (`Workspace.status = ACTIVE`). User-ID backfill is a server-side idempotent operation in Task 2 because Prisma migration SQL must not call external Auth APIs.

Enable RLS and add lifecycle indexes. Prisma creates the membership compound unique and user lookup index declared in the schema, so the migration must not add duplicate manual indexes:

```sql
ALTER TABLE "PlatformUserControl" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "Workspace_status_createdAt_idx" ON "Workspace"("status", "createdAt");
```

- [ ] **Step 4: Update repository and provisioning contracts**

Change `ensureWorkspace(workspaceId, ownerEmail, ownerUserId?)`, bind user ID during signup/OAuth/invitation acceptance, and preserve normalized email. Add lifecycle methods to both Prisma and memory repositories.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/repository.test.ts src/lib/auth/provision-workspace.test.ts src/lib/auth/invitations.test.ts`

Expected: schema and tests pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260831130000_admin_account_controls/migration.sql src/lib/repository.ts src/lib/memory-repository.ts src/lib/repository.test.ts src/lib/auth/provision-workspace.ts src/lib/auth/invitations.ts src/lib/auth
git commit -m "feat(admin): add account lifecycle controls"
```

### Task 2: Backfill user IDs and enforce suspensions in every session

**Files:**
- Create: `scripts/backfill-member-user-ids.mjs`
- Create: `scripts/backfill-member-user-ids.test.ts`
- Modify: `package.json`
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/session.test.ts`
- Modify: `src/lib/admin/authorization.ts`
- Modify: `src/lib/admin/authorization.test.ts`
- Modify: `proxy.ts`
- Modify: `src/worker.ts`
- Modify: `src/lib/queue.test.ts`

**Interfaces:**
- Produces command: `pnpm backfill:member-user-ids`.
- Produces: `assertApplicationAccess(userId, issuedAt): Promise<{ workspaceId; email }>`.

- [ ] **Step 1: Write failing backfill and access tests**

```ts
it("matches every normalized membership to its Supabase user and is idempotent", async () => {
  const result = await backfillMemberUserIds({ users: [{ id: "u1", email: "Owner@Linkar.in" }], members: [{ id: "m1", email: "owner@linkar.in", userId: null }, { id: "m2", email: "owner@linkar.in", userId: null }] });
  expect(result.updates).toEqual([{ memberId: "m1", userId: "u1" }, { memberId: "m2", userId: "u1" }]);
});

it.each(["SUSPENDED", "DELETION_PENDING"])("rejects a %s workspace", async (status) => {
  repository.accessState = { userStatus: "ACTIVE", workspaceStatus: status, sessionInvalidBefore: null };
  await expect(getValidatedSession(request)).resolves.toBeNull();
});

it("rejects tokens issued before sessionInvalidBefore", async () => {
  repository.accessState = { userStatus: "ACTIVE", workspaceStatus: "ACTIVE", sessionInvalidBefore: "2026-08-31T10:00:00.000Z" };
  mocks.getClaims.mockResolvedValue(claims({ iat: Math.floor(Date.parse("2026-08-31T09:59:00.000Z") / 1000) }));
  await expect(getValidatedSession(request)).resolves.toBeNull();
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run scripts/backfill-member-user-ids.test.ts src/lib/auth/session.test.ts src/lib/queue.test.ts`

Expected: FAIL because access-state enforcement is missing.

- [ ] **Step 3: Implement paginated Auth backfill**

Use `createSupabaseAdminClient().auth.admin.listUsers({ page, perPage: 1000 })`, normalize email, reject duplicate Auth emails, update every null `WorkspaceMember.userId` matched by membership ID, and print counts without printing email addresses. Exit nonzero on ambiguous matches.

- [ ] **Step 4: Enforce lifecycle in HTTP and worker boundaries**

`getValidatedSession()` uses the stable `sub` first and falls back to normalized email only for not-yet-backfilled sessions. It checks `PlatformUserControl`, workspace status, and JWT `iat`. `getPlatformOwnerSession()` applies the same user-control and stale-session checks after allowlist validation, so a deployment-level recovery action can suspend or revoke an owner session without making email/metadata authoritative. Webhook handlers may acknowledge suspended-workspace events but must not enqueue work. Worker processors re-check workspace status before provider dispatch.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run scripts/backfill-member-user-ids.test.ts src/lib/auth/session.test.ts src/lib/admin/authorization.test.ts src/lib/queue.test.ts src/lib/automation/runner.test.ts && pnpm typecheck`

Expected: tests pass and no secrets/PII appear in output fixtures.

- [ ] **Step 6: Commit**

```bash
git add scripts/backfill-member-user-ids.mjs scripts/backfill-member-user-ids.test.ts package.json src/lib/auth/session.ts src/lib/auth/session.test.ts src/lib/admin/authorization.ts src/lib/admin/authorization.test.ts proxy.ts src/worker.ts src/lib/queue.test.ts src/lib/automation/runner.test.ts
git commit -m "feat(admin): enforce user and workspace suspension"
```

### Task 3: Persist plan templates, workspace entitlements, and monthly usage

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260831140000_workspace_entitlements/migration.sql`
- Create: `src/lib/entitlements/types.ts`
- Create: `src/lib/entitlements/service.ts`
- Create: `src/lib/entitlements/service.test.ts`
- Create: `src/lib/entitlements/repository.ts`
- Create: `src/lib/entitlements/memory-repository.ts`

**Interfaces:**
- Produces `EffectiveEntitlements` with nullable integer limits and explicit feature booleans.
- Produces `getEffectiveEntitlements(workspaceId): Promise<EffectiveEntitlements>`.
- Produces `assertEntitled(workspaceId, capability, currentUsage): Promise<void>`.
- Produces `reserveMonthlyDelivery(workspaceId, key): Promise<{ reserved: boolean; used; limit }>`.

- [ ] **Step 1: Write failing resolution and concurrency tests**

```ts
it("resolves workspace overrides over plan defaults", async () => {
  repository.plan = { key: "free", automationLimit: 3, monthlyDeliveryLimit: 100, broadcastsEnabled: false };
  repository.entitlement = { overrides: { automationLimit: 10, broadcastsEnabled: true } };
  expect(await service.getEffectiveEntitlements("w1")).toMatchObject({ automationLimit: 10, monthlyDeliveryLimit: 100, broadcastsEnabled: true });
});

it("allows only reservations within the monthly limit under concurrency", async () => {
  repository.plan.monthlyDeliveryLimit = 2;
  const results = await Promise.all(["d1", "d2", "d3"].map((key) => service.reserveMonthlyDelivery("w1", key)));
  expect(results.filter((result) => result.reserved)).toHaveLength(2);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/entitlements/service.test.ts`

Expected: FAIL because entitlement modules do not exist.

- [ ] **Step 3: Add schema and seeded free plan**

`PlanDefinition` has nullable nonnegative integer limits (`null` means unlimited), explicit feature booleans, stable unique key, and active flag. `WorkspaceEntitlement` references workspace and plan, stores typed overrides JSON and a version. `WorkspaceUsagePeriod` uses `(workspaceId, periodStart)` primary key and stores `deliveriesReserved`, `broadcastsCreated`, and `updatedAt`.

The migration inserts one `free` plan and creates a matching entitlement for every existing workspace. Enable RLS and index `WorkspaceEntitlement.planId`.

- [ ] **Step 4: Implement typed resolution and atomic reservation**

Use a strict Zod schema for overrides. The Prisma reservation uses a short transaction and an atomic conditional update so concurrent sends cannot exceed the limit. Record delivery reservation keys in a companion `WorkspaceUsageReservation` table with unique `deliveryKey` to make retries idempotent.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/entitlements/service.test.ts`

Expected: tests pass.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260831140000_workspace_entitlements/migration.sql src/lib/entitlements
git commit -m "feat(plans): add enforceable workspace entitlements"
```

### Task 4: Enforce resource and delivery limits across the app

**Files:**
- Modify: `app/api/team/invitations/route.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/sequences/route.ts`
- Modify: `app/api/broadcasts/route.ts`
- Modify: `app/api/links/route.ts`
- Modify: `app/api/meta/connection/route.ts`
- Modify: `app/api/facebook/connection/route.ts`
- Modify: `app/api/contacts/export/route.ts`
- Modify: `src/lib/automation/outbound-delivery.ts`
- Create: `app/api/team/invitations/route.test.ts`
- Modify: `app/api/automations/route.test.ts`
- Modify: `app/api/sequences/route.test.ts`
- Modify: `app/api/broadcasts/route.test.ts`
- Create: `app/api/links/route.test.ts`
- Modify: `app/api/meta/connection/route.test.ts`
- Modify: `app/api/facebook/connection/route.test.ts`
- Create: `app/api/contacts/export/route.test.ts`
- Modify: `src/lib/automation/outbound-delivery.test.ts`

**Interfaces:**
- Produces consistent `403 { error: "entitlement_required", capability }` and `409 { error: "limit_reached", capability, used, limit }` responses.

- [ ] **Step 1: Add one failing behavior test per guarded capability**

```ts
it("rejects a fourth automation on a three-automation plan", async () => {
  entitlementService.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "automations", 3, 3));
  const response = await POST(jsonRequest(validAutomation));
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "limit_reached", capability: "automations", used: 3, limit: 3 });
});
```

Repeat with literal expected payloads for members, Instagram, Facebook, sequences, broadcasts, tracked links, exports, and monthly delivery reservations.

- [ ] **Step 2: Run all affected tests and verify RED**

Run: `pnpm vitest run app/api/team app/api/automations/route.test.ts app/api/sequences app/api/broadcasts app/api/links app/api/meta/connection app/api/facebook/connection app/api/contacts/export src/lib/automation/outbound-delivery.test.ts`

Expected: new tests fail because routes do not call EntitlementService.

- [ ] **Step 3: Add minimal guards to each write boundary**

Count current resources from the repository, resolve entitlements once per request, and call `assertEntitled` before mutation. Reserve monthly delivery immediately before durable provider dispatch; release only for known-not-sent terminal outcomes.

- [ ] **Step 4: Verify GREEN and full automation safety**

Run: `pnpm vitest run app/api/team app/api/automations app/api/sequences app/api/broadcasts app/api/links app/api/meta app/api/facebook app/api/contacts/export src/lib/automation && pnpm typecheck`

Expected: tests pass and delivery-idempotency tests remain green.

- [ ] **Step 5: Commit**

```bash
git add app/api/team app/api/automations app/api/sequences app/api/broadcasts app/api/links app/api/meta app/api/facebook app/api/contacts/export src/lib/automation
git commit -m "feat(plans): enforce workspace limits"
```

### Task 5: Build the cross-tenant account repository and cursor DTOs

**Files:**
- Create: `src/lib/admin/accounts-repository.ts`
- Create: `src/lib/admin/prisma-accounts-repository.ts`
- Create: `src/lib/admin/memory-accounts-repository.ts`
- Create: `src/lib/admin/accounts-repository.test.ts`
- Create: `src/lib/admin/cursor.ts`
- Create: `src/lib/admin/cursor.test.ts`

**Interfaces:**
- Produces `listAdminWorkspaces(query): Promise<CursorPage<AdminWorkspaceSummary>>`.
- Produces `getAdminWorkspace(id): Promise<AdminWorkspaceDetail | null>`.
- Produces `listAdminUsers(query): Promise<CursorPage<AdminUserSummary>>`.
- Produces `getAdminUser(id): Promise<AdminUserDetail | null>`.

- [ ] **Step 1: Write failing cursor and DTO tests**

```ts
it("round-trips a createdAt/id cursor and rejects tampering", () => {
  const cursor = encodeAdminCursor({ createdAt: "2026-08-31T10:00:00.000Z", id: "w1" }, "secret");
  expect(decodeAdminCursor(cursor, "secret")).toEqual({ createdAt: "2026-08-31T10:00:00.000Z", id: "w1" });
  expect(() => decodeAdminCursor(`${cursor}x`, "secret")).toThrow("invalid_cursor");
});

it("never returns encrypted connection fields in workspace DTOs", async () => {
  const page = await repository.listAdminWorkspaces({ limit: 25 });
  expect(JSON.stringify(page)).not.toMatch(/accessTokenEncrypted|secret|password/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/cursor.test.ts src/lib/admin/accounts-repository.test.ts`

Expected: FAIL because the repository and cursor codec do not exist.

- [ ] **Step 3: Implement signed keyset cursors and bounded DTOs**

Use HMAC-SHA256 with `AUTH_SESSION_SECRET`, a maximum page size of 100, default 25, and `(createdAt, id)` keyset ordering. Join only the counts/status/plan fields the UI needs. Supabase user pagination is adapted into the same DTO contract without loading all users into the browser.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/cursor.test.ts src/lib/admin/accounts-repository.test.ts && pnpm typecheck`

Expected: tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/accounts-repository.ts src/lib/admin/prisma-accounts-repository.ts src/lib/admin/memory-accounts-repository.ts src/lib/admin/accounts-repository.test.ts src/lib/admin/cursor.ts src/lib/admin/cursor.test.ts
git commit -m "feat(admin): add cross-tenant account queries"
```

### Task 6: Build workspace admin APIs and screens

**Files:**
- Create: `app/api/admin/workspaces/route.ts`
- Create: `app/api/admin/workspaces/route.test.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/route.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/route.test.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/members/route.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/lifecycle/route.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/export/route.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/export/route.test.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/automations/pause/route.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/automations/pause/route.test.ts`
- Create: `app/admin/workspaces/page.tsx`
- Create: `app/admin/workspaces/loading.tsx`
- Create: `app/admin/workspaces/[workspaceId]/page.tsx`
- Create: `app/admin/workspaces/[workspaceId]/loading.tsx`
- Create: `src/components/admin/workspaces-screen.tsx`
- Create: `src/components/admin/workspace-detail-screen.tsx`
- Create: `src/components/admin/workspaces-screen.test.tsx`
- Create: `src/components/admin/workspace-detail-screen.test.tsx`

**Interfaces:**
- GET list/detail use cursor DTOs; POST list creates a workspace and initial owner membership atomically.
- PATCH detail accepts name/slug with `version` and reason.
- POST members adds, changes role, or transfers ownership; DELETE removes non-owner members.
- POST lifecycle accepts `SUSPEND` or `RESTORE`; permanent deletion is Phase 4.
- Export streams the safe workspace dataset as formula-escaped CSV/JSON, and bulk pause uses version-checked domain commands without touching archived automations.

- [ ] **Step 1: Write failing API transition tests**

Test literal outcomes for create, duplicate slug `409`, rename, owner transfer, platform-owner protection, suspension, restoration, safe export redaction/escaping, pause-all partial conflicts, missing reason, stale version, non-owner authorization, and audit `ATTEMPT`/`SUCCESS` writes.

- [ ] **Step 2: Write failing component behavior tests**

Assert search query updates, cursor navigation, selected workspace identity, tab navigation, effective plan/usage rendering, suspension confirmation phrase, error persistence, and focus restoration.

- [ ] **Step 3: Run and verify RED**

Run: `pnpm vitest run app/api/admin/workspaces src/components/admin/workspaces-screen.test.tsx src/components/admin/workspace-detail-screen.test.tsx`

Expected: FAIL because routes and screens do not exist.

- [ ] **Step 4: Implement APIs and Linkar-styled screens**

Use `RouteContext<'/api/admin/workspaces/[workspaceId]'>` and `await context.params`. Every mutation runs request guard, validates strict Zod input, appends audit events, and returns a redacted DTO. Use the existing section rail, panels, badges, form controls, and responsive table patterns.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run app/api/admin/workspaces src/components/admin/workspaces-screen.test.tsx src/components/admin/workspace-detail-screen.test.tsx && pnpm lint`

Expected: tests and lint pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/workspaces app/admin/workspaces src/components/admin/workspaces-screen.tsx src/components/admin/workspaces-screen.test.tsx src/components/admin/workspace-detail-screen.tsx src/components/admin/workspace-detail-screen.test.tsx app/globals.css
git commit -m "feat(admin): manage every workspace"
```

### Task 7: Build user admin APIs and screens

**Files:**
- Create: `app/api/admin/users/route.ts`
- Create: `app/api/admin/users/route.test.ts`
- Create: `app/api/admin/users/[userId]/route.ts`
- Create: `app/api/admin/users/[userId]/route.test.ts`
- Create: `app/api/admin/users/[userId]/access/route.ts`
- Create: `app/api/admin/users/[userId]/reset/route.ts`
- Create: `app/api/admin/users/[userId]/memberships/route.ts`
- Create: `app/admin/users/page.tsx`
- Create: `app/admin/users/[userId]/page.tsx`
- Create: `src/components/admin/users-screen.tsx`
- Create: `src/components/admin/user-detail-screen.tsx`
- Create: `src/components/admin/users-screen.test.tsx`
- Create: `src/components/admin/user-detail-screen.test.tsx`

**Interfaces:**
- User list/detail joins Supabase Auth and Linkar membership without exposing identity provider tokens; POST list supports explicit invite or confirmed/unconfirmed user creation.
- PATCH updates email/confirmation through server-side Supabase Admin API.
- POST access performs `SUSPEND`, `RESTORE`, `REVOKE_LINKAR_SESSIONS`, `BAN`, or `UNBAN`.
- POST reset sends a password-reset link; it never sets or displays a password.
- Membership commands add/remove a user from a workspace and change role while preserving at least one owner.

- [ ] **Step 1: Write failing server behavior tests**

Prove allowlisted owner IDs cannot be targeted, invite/create modes use the selected confirmation behavior, Auth errors append `FAILURE`, email changes update membership atomically after Auth success, session revocation advances `sessionInvalidBefore`, membership changes preserve a workspace owner, and reset sends only to the selected current email.

- [ ] **Step 2: Write failing UI tests**

Prove search/status filters, detail loading, role changes, reset confirmation, suspension/restoration, ban/unban copy, and audit history render the exact selected user ID/email.

- [ ] **Step 3: Run and verify RED**

Run: `pnpm vitest run app/api/admin/users src/components/admin/users-screen.test.tsx src/components/admin/user-detail-screen.test.tsx`

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement Supabase Admin mutations and direct Linkar controls**

Use `listUsers`, `getUserById`, `inviteUserByEmail`, `createUser`, `updateUserById`, `generateLink({ type: "recovery" })`, and server-side mail delivery. Ban uses explicit finite/unban values supported by the installed Supabase client. Do not use user metadata for authorization or plan state.

- [ ] **Step 5: Verify GREEN**

Run: `pnpm vitest run app/api/admin/users src/components/admin/users-screen.test.tsx src/components/admin/user-detail-screen.test.tsx src/lib/auth/session.test.ts && pnpm typecheck && pnpm lint`

Expected: tests, typecheck, and lint pass.

- [ ] **Step 6: Commit**

```bash
git add app/api/admin/users app/admin/users src/components/admin/users-screen.tsx src/components/admin/users-screen.test.tsx src/components/admin/user-detail-screen.tsx src/components/admin/user-detail-screen.test.tsx
git commit -m "feat(admin): manage Linkar users"
```

### Task 8: Build plan-template and workspace-override controls

**Files:**
- Create: `app/api/admin/plans/route.ts`
- Create: `app/api/admin/plans/route.test.ts`
- Create: `app/api/admin/plans/[planId]/route.ts`
- Create: `app/api/admin/plans/[planId]/route.test.ts`
- Create: `app/api/admin/workspaces/[workspaceId]/entitlement/route.ts`
- Create: `app/admin/plans/page.tsx`
- Create: `app/admin/plans/loading.tsx`
- Create: `src/components/admin/plans-screen.tsx`
- Create: `src/components/admin/plans-screen.test.tsx`
- Modify: `app/api/account/route.ts`
- Modify: `app/api/account/route.test.ts`
- Modify: `app/api/workspace/bootstrap/route.ts`
- Create: `app/api/workspace/bootstrap/route.test.ts`
- Modify: `src/lib/client/workspace-data.ts`
- Modify: `src/lib/client/workspace-data.test.ts`

**Interfaces:**
- Plan CRUD preserves stable keys; a referenced plan is retired, not deleted.
- Entitlement PATCH accepts `{ planId, overrides, version, reason }`.
- Account/bootstrap DTOs return the effective plan key.

- [ ] **Step 1: Write failing plan lifecycle tests**

Test creation, duplicate key `409`, nullable unlimited limits, negative limit `422`, retire referenced plan, optimistic version conflict, override reset, audit snapshots, and effective app-shell plan display.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run app/api/admin/plans app/api/admin/workspaces src/components/admin/plans-screen.test.tsx app/api/account/route.test.ts src/lib/client/workspace-data.test.ts`

Expected: tests fail because plan APIs/UI and real bootstrap plan are missing.

- [ ] **Step 3: Implement strict plan forms and APIs**

Render limits as nullable numeric controls with an explicit Unlimited switch. Show the number of assigned workspaces before retirement. Workspace detail shows defaults, overrides, effective values, and current usage side by side.

- [ ] **Step 4: Verify Phase 2**

Run: `pnpm vitest run src/lib/entitlements src/lib/admin app/api/admin app/api/account app/api/workspace src/components/admin src/lib/auth/session.test.ts src/lib/automation && pnpm typecheck && pnpm lint && pnpm prisma validate && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/plans app/api/admin/workspaces app/admin/plans src/components/admin/plans-screen.tsx src/components/admin/plans-screen.test.tsx app/api/account/route.ts app/api/account/route.test.ts app/api/workspace/bootstrap/route.ts src/lib/client/workspace-data.ts src/lib/client/workspace-data.test.ts
git commit -m "feat(admin): manage plans and workspace limits"
```

## Phase 2 Completion Gate

- [ ] Every workspace member is linked to a stable Supabase user ID or is reported as an explicit backfill exception.
- [ ] Suspended users/workspaces cannot use customer APIs or worker dispatch and can be restored.
- [ ] Platform-owner identities cannot be targeted by lifecycle actions.
- [ ] Plan templates, overrides, and monthly usage are persisted and enforced.
- [ ] All resource limits return consistent typed errors.
- [ ] Owner can manage workspaces, users, roles, plans, and limits from responsive admin screens.
- [ ] AppShell displays the effective persisted plan instead of hard-coded `free`.
