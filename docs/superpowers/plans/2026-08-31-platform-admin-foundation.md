# Platform Admin Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents; execute inline.

**Goal:** Establish the fail-closed owner authorization boundary, MFA gate, append-only audit system, Linkar-styled admin shell, and real operational overview for `/admin`.

**Architecture:** Add a server-only admin DAL alongside the tenant repository. Page components and every `/api/admin` route call the DAL directly; Proxy only refreshes sessions and performs an optimistic page gate. An exact Supabase user-ID allowlist plus AAL2 protects the console, while Postgres stores redacted append-only audit events.

**Tech Stack:** Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5.9.3, Supabase Auth 2.112.4, Prisma 6.19.3, PostgreSQL, Redis, Zod 4.4.3, Vitest 4.1.11.

**Spec:** `docs/superpowers/specs/2026-08-31-platform-owner-admin-console-design.md`

## Global Constraints

- Admin access is authorized only by exact UUIDs in server-only `PLATFORM_OWNER_USER_IDS`; workspace roles, email, and `user_metadata` never authorize it.
- The full console requires Supabase AAL2. `/admin/security` alone may use an AAL1 allowlisted-owner identity to enroll TOTP.
- Every privileged API route independently checks authorization; Proxy is never the source of truth.
- Service-role credentials and provider secrets remain server-only and never enter DTOs, logs, audit snapshots, or client bundles.
- New public-schema tables have RLS enabled with no `anon` or `authenticated` policies.
- All changes follow red-green-refactor and preserve the existing Linkar Volt design system, dark mode, mobile behavior, keyboard navigation, and reduced motion.

---

### Task 1: Parse and validate the platform-owner configuration

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`
- Modify: `.env.production.example`
- Test: `src/lib/env.test.ts`

**Interfaces:**
- Produces: `ServerEnv.platformOwnerUserIds: string[]`
- Produces: `parseUuidList(name: string, value: string | undefined): string[]`

- [x] **Step 1: Write the failing environment tests**

```ts
it("parses a comma-separated platform owner UUID allowlist", () => {
  process.env.PLATFORM_OWNER_USER_IDS = "11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222";
  expect(getServerEnv().platformOwnerUserIds).toEqual([
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
  ]);
});

it("rejects malformed platform owner identifiers", () => {
  process.env.PLATFORM_OWNER_USER_IDS = "owner@example.com";
  expect(() => getServerEnv()).toThrow("PLATFORM_OWNER_USER_IDS must contain UUIDs");
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm vitest run src/lib/env.test.ts`

Expected: FAIL because `platformOwnerUserIds` does not exist and malformed values are accepted.

- [x] **Step 3: Implement strict UUID-list parsing**

```ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseUuidList(name: string, value: string | undefined): string[] {
  const ids = [...new Set((value ?? "").split(",").map((id) => id.trim().toLowerCase()).filter(Boolean))];
  if (ids.some((id) => !UUID.test(id))) throw new Error(`${name} must contain UUIDs`);
  if (process.env.NODE_ENV === "production" && ids.length === 0) throw new Error(`${name} is required in production`);
  return ids;
}
```

Add `PLATFORM_OWNER_USER_IDS=` to `.env.example` and a required placeholder UUID to `.env.production.example`.

- [x] **Step 4: Verify GREEN and type safety**

Run: `pnpm vitest run src/lib/env.test.ts && pnpm typecheck`

Expected: all focused tests pass and TypeScript exits 0.

- [x] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/env.test.ts .env.example .env.production.example
git commit -m "feat(admin): validate platform owner allowlist"
```

### Task 2: Build the owner identity and AAL2 authorization DAL

**Files:**
- Create: `src/lib/admin/authorization.ts`
- Create: `src/lib/admin/authorization.test.ts`
- Modify: `src/lib/supabase/server.ts`
- Modify: `src/lib/auth/session.ts`

**Interfaces:**
- Produces: `PlatformOwnerIdentity { userId; email; sessionId; aal }`
- Produces: `getPlatformOwnerIdentity(): Promise<PlatformOwnerIdentity>`
- Produces: `getPlatformOwnerSession(): Promise<PlatformOwnerIdentity>`
- Produces: `PlatformOwnerAuthError` with status `401 | 403 | 428`

- [x] **Step 1: Write failing pure authorization tests**

```ts
it.each([
  [{}, 401],
  [{ sub: "33333333-3333-4333-8333-333333333333", email: "owner@linkar.in", session_id: "s1", aal: "aal2" }, 403],
  [{ sub: OWNER_ID, email: "owner@linkar.in", session_id: "s1", aal: "aal1" }, 428],
])("rejects invalid owner claims %#", (claims, status) => {
  expect(() => authorizePlatformOwner(claims, [OWNER_ID], true)).toThrow(expect.objectContaining({ status }));
});

it("returns only the verified owner identity fields", () => {
  expect(authorizePlatformOwner({ sub: OWNER_ID, email: "owner@linkar.in", session_id: "s1", aal: "aal2", user_metadata: { admin: true } }, [OWNER_ID], true))
    .toEqual({ userId: OWNER_ID, email: "owner@linkar.in", sessionId: "s1", aal: "aal2" });
});
```

The production change each test catches is accepting an unsigned/missing identity, a non-allowlisted UUID, AAL1, or extra user-controlled metadata.

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/authorization.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the server-only DAL**

```ts
import "server-only";

export function authorizePlatformOwner(
  claims: Record<string, unknown>,
  ownerIds: readonly string[],
  requireAal2: boolean,
): PlatformOwnerIdentity {
  const userId = typeof claims.sub === "string" ? claims.sub.toLowerCase() : "";
  if (!userId) throw new PlatformOwnerAuthError(401, "unauthorized");
  if (!ownerIds.includes(userId)) throw new PlatformOwnerAuthError(403, "forbidden");
  const aal = claims.aal === "aal2" ? "aal2" : "aal1";
  if (requireAal2 && aal !== "aal2") throw new PlatformOwnerAuthError(428, "mfa_required");
  const email = typeof claims.email === "string" ? claims.email : "";
  const sessionId = typeof claims.session_id === "string" ? claims.session_id : "";
  if (!email || !sessionId) throw new PlatformOwnerAuthError(401, "unauthorized");
  return { userId, email, sessionId, aal };
}
```

`getPlatformOwnerIdentity()` calls `createSupabaseServerClient().auth.getClaims()` and passes `requireAal2=false`; `getPlatformOwnerSession()` passes `true`. Do not read `getSession()`.

- [x] **Step 4: Add session-control hook without changing behavior yet**

Add an optional `validateApplicationSession` dependency in `getValidatedSession()` that defaults to an allow-all implementation until Phase 2 installs persisted user/workspace suspension. Test that the hook can reject a session.

- [x] **Step 5: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/authorization.test.ts src/lib/auth/session.test.ts && pnpm typecheck`

Expected: all tests pass.

- [x] **Step 6: Commit**

```bash
git add src/lib/admin/authorization.ts src/lib/admin/authorization.test.ts src/lib/supabase/server.ts src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat(admin): add owner authorization boundary"
```

### Task 3: Add append-only admin audit persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260831120000_platform_admin_audit/migration.sql`
- Create: `src/lib/admin/audit.ts`
- Create: `src/lib/admin/audit.test.ts`
- Modify: `src/lib/prisma.ts`

**Interfaces:**
- Produces: `AdminAuditInput`
- Produces: `redactAdminAuditValue(value: unknown): unknown`
- Produces: `appendAdminAuditEvent(input: AdminAuditInput): Promise<void>`

- [x] **Step 1: Write failing redaction tests**

```ts
it("redacts secret-bearing keys recursively", () => {
  expect(redactAdminAuditValue({ email: "a@b.com", accessTokenEncrypted: "cipher", nested: { password: "pw", status: "ACTIVE" } }))
    .toEqual({ email: "a@b.com", accessTokenEncrypted: "[REDACTED]", nested: { password: "[REDACTED]", status: "ACTIVE" } });
});

it("truncates oversized strings and arrays", () => {
  expect(JSON.stringify(redactAdminAuditValue({ value: "x".repeat(20_000) })).length).toBeLessThan(9_000);
});
```

- [x] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/audit.test.ts`

Expected: FAIL because audit helpers do not exist.

- [x] **Step 3: Add Prisma model and SQL protections**

Add `AdminAuditEvent` with `id`, `requestId`, `phase`, `actorUserId`, `actorEmail`, `sessionId`, `action`, `targetType`, `targetId`, optional `workspaceId`, `reason`, optional `before`/`after`, optional `errorCode`, `ipHash`, `userAgent`, optional approved request `origin`, and `createdAt`.

The migration must include:

```sql
ALTER TABLE "AdminAuditEvent" ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX "AdminAuditEvent_requestId_phase_key" ON "AdminAuditEvent"("requestId", "phase");
CREATE INDEX "AdminAuditEvent_createdAt_id_idx" ON "AdminAuditEvent"("createdAt", "id");
CREATE INDEX "AdminAuditEvent_workspaceId_createdAt_idx" ON "AdminAuditEvent"("workspaceId", "createdAt");

CREATE FUNCTION reject_admin_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditEvent is append-only';
END;
$$;
CREATE TRIGGER admin_audit_no_update_delete
BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();
```

- [x] **Step 4: Implement redaction and append-only writes**

Redact keys matching `/token|secret|password|cookie|authorization|otp|signedrequest|payload/i`, cap strings at 4,000 characters, arrays at 100 entries, and object depth at six. `appendAdminAuditEvent()` creates a new custom Linkar ID and never exposes update/delete methods.

- [x] **Step 5: Verify schema and GREEN**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/admin/audit.test.ts src/lib/migration-history.test.ts`

Expected: schema valid and tests pass.

- [x] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260831120000_platform_admin_audit/migration.sql src/lib/admin/audit.ts src/lib/admin/audit.test.ts src/lib/migration-history.test.ts
git commit -m "feat(admin): add append-only audit events"
```

### Task 4: Enforce origin, reason, idempotency, and one-time confirmation challenges

**Files:**
- Create: `src/lib/admin/request-guard.ts`
- Create: `src/lib/admin/request-guard.test.ts`
- Create: `src/lib/admin/challenges.ts`
- Create: `src/lib/admin/challenges.test.ts`

**Interfaces:**
- Produces: `requireAdminRead(request: Request): Promise<PlatformOwnerIdentity>`
- Produces: `requireAdminWrite(request: Request, options): Promise<{ owner; reason; idempotencyKey }>`
- Produces: `createAdminChallenge(input): Promise<{ token; expiresAt }>`
- Produces: `consumeAdminChallenge(input): Promise<void>`

- [ ] **Step 1: Write failing request-policy tests**

```ts
it.each([
  [new Request("https://app.linkar.in/api/admin/x", { method: "POST" }), 403],
  [new Request("https://app.linkar.in/api/admin/x", { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" } }), 403],
  [new Request("https://app.linkar.in/api/admin/x", { method: "POST", headers: { origin: "https://app.linkar.in", "content-type": "text/plain" } }), 415],
])("rejects unsafe admin writes %#", async (request, status) => {
  await expect(requireAdminWrite(request, { action: "workspace.suspend", targetType: "workspace", targetId: "w1" })).rejects.toMatchObject({ status });
});
```

Add a challenge test proving the first exact action/target/session consumption succeeds and the second fails with `409`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/request-guard.test.ts src/lib/admin/challenges.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement the guards and Redis challenge record**

Store only a SHA-256 hash of the random challenge token under `admin-challenge:<hash>` with a 600-second TTL. The JSON value contains `userId`, `sessionId`, `action`, `targetType`, `targetId`, `expectedVersion`, and `confirmationHash`. Consume with a single Redis Lua compare-and-delete operation so concurrent submissions cannot both succeed.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm vitest run src/lib/admin/request-guard.test.ts src/lib/admin/challenges.test.ts && pnpm typecheck`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/admin/request-guard.ts src/lib/admin/request-guard.test.ts src/lib/admin/challenges.ts src/lib/admin/challenges.test.ts
git commit -m "feat(admin): protect privileged mutations"
```

### Task 5: Build the owner MFA enrollment gate

**Files:**
- Create: `app/admin/security/page.tsx`
- Create: `app/admin/security/loading.tsx`
- Create: `app/api/admin/security/route.ts`
- Create: `app/api/admin/security/route.test.ts`
- Create: `src/components/admin/admin-security-screen.tsx`
- Create: `src/components/admin/admin-security-screen.test.tsx`

**Interfaces:**
- `GET /api/admin/security` returns current AAL and verified/unverified TOTP factors for the allowlisted owner.
- `POST /api/admin/security` accepts `{ action: "enroll" }`, `{ action: "verify", factorId, code }`, or challenge-protected `{ action: "unenroll", factorId, reason }` from an AAL2 owner.

- [ ] **Step 1: Write failing route and component tests**

```ts
it("allows an AAL1 owner to enroll but rejects a non-owner", async () => {
  mocks.identity.mockResolvedValueOnce({ userId: OWNER_ID, email: "owner@linkar.in", sessionId: "s1", aal: "aal1" });
  expect((await POST(jsonRequest({ action: "enroll" }))).status).toBe(200);
  mocks.identity.mockRejectedValueOnce(new PlatformOwnerAuthError(403, "forbidden"));
  expect((await POST(jsonRequest({ action: "enroll" }))).status).toBe(403);
});
```

Component tests assert the QR/secret is shown only after enrollment, six-digit codes are validated, errors remain in the security panel, success navigates to `/admin`, and removing a factor requires AAL2 plus an explicit confirmation challenge.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run app/api/admin/security/route.test.ts src/components/admin/admin-security-screen.test.tsx`

Expected: FAIL because routes/components do not exist.

- [ ] **Step 3: Implement Supabase MFA calls server-side**

Use `supabase.auth.mfa.listFactors()`, `getAuthenticatorAssuranceLevel()`, `enroll({ factorType: "totp", friendlyName: "Linkar Operator" })`, `challengeAndVerify({ factorId, code })`, and `unenroll({ factorId })`. Return only factor IDs, friendly names, status, QR URI, and secret needed for active enrollment. Factor removal is reasoned, audited, single-use-challenge protected, and must not remove the last verified factor unless a second verified factor exists.

- [ ] **Step 4: Verify GREEN and accessibility**

Run: `pnpm vitest run app/api/admin/security/route.test.ts src/components/admin/admin-security-screen.test.tsx && pnpm lint`

Expected: tests and lint pass.

- [ ] **Step 5: Commit**

```bash
git add app/admin/security app/api/admin/security src/components/admin/admin-security-screen.tsx src/components/admin/admin-security-screen.test.tsx
git commit -m "feat(admin): require owner MFA enrollment"
```

### Task 6: Build the AdminShell and protected navigation

**Files:**
- Create: `app/admin/layout.tsx`
- Create: `src/components/admin/admin-shell.tsx`
- Create: `src/components/admin/admin-shell.test.tsx`
- Create: `src/components/admin/admin-route-guard.tsx`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `app/globals.css`
- Modify: `src/lib/site-routing.ts`
- Modify: `src/lib/site-routing.test.ts`
- Modify: `proxy.ts`
- Modify: `src/proxy-coverage.test.ts`

**Interfaces:**
- Produces: `AdminShell({ owner, children })`
- Produces: `AdminRouteGuard({ children, requireAal2 })` that calls the server DAL close to the rendered data.
- Adds `/admin` to app-host canonicalization and protected Proxy coverage.

- [ ] **Step 1: Write failing shell and routing tests**

```tsx
it("renders the operator navigation without customer workspace links", () => {
  render(<AdminShell owner={{ email: "owner@linkar.in" }}><main>Overview</main></AdminShell>);
  expect(screen.getByText("LINKAR OPERATOR")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Workspaces" })).toHaveAttribute("href", "/admin/workspaces");
  expect(screen.queryByRole("link", { name: "Broadcasts" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to workspace" })).toHaveAttribute("href", "/dashboard");
});
```

Add host-routing coverage proving `https://linkar.in/admin` redirects to `https://app.linkar.in/admin` and Proxy matcher coverage includes `/admin/:path*`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/components/admin/admin-shell.test.tsx src/lib/site-routing.test.ts src/proxy-coverage.test.ts`

Expected: FAIL because AdminShell and `/admin` routing do not exist.

- [ ] **Step 3: Implement the shared shell behavior**

Use the existing sidebar width, drawer focus trap, ThemeToggle, active-link behavior, and mobile top bar. `app/admin/layout.tsx` verifies allowlisted owner identity at AAL1 so the enrollment route can render; every admin page except `/admin/security` wraps its data with `AdminRouteGuard requireAal2`. Admin navigation is exactly Overview, Workspaces, Users, Plans, Operations, Integrations, System, Audit, Security. Add the volt-yellow operator rail without introducing new fonts or dependencies.

The regular AppShell receives `platformOwner` from `/api/workspace/bootstrap` and shows an Admin link only when true; the admin route remains secure when the link is absent or manually entered.

- [ ] **Step 4: Verify GREEN and responsive CSS invariants**

Run: `pnpm vitest run src/components/admin/admin-shell.test.tsx src/components/app-shell.test.tsx src/lib/site-routing.test.ts src/proxy-coverage.test.ts && pnpm lint`

Expected: tests and lint pass.

- [ ] **Step 5: Commit**

```bash
git add app/admin/layout.tsx src/components/admin/admin-shell.tsx src/components/admin/admin-shell.test.tsx src/components/admin/admin-route-guard.tsx src/components/app-shell.tsx src/components/app-shell.test.tsx app/globals.css src/lib/site-routing.ts src/lib/site-routing.test.ts proxy.ts src/proxy-coverage.test.ts
git commit -m "feat(admin): add protected operator shell"
```

### Task 7: Ship a real admin overview

**Files:**
- Create: `app/admin/page.tsx`
- Create: `app/admin/loading.tsx`
- Create: `app/api/admin/overview/route.ts`
- Create: `app/api/admin/overview/route.test.ts`
- Create: `src/lib/admin/overview.ts`
- Create: `src/lib/admin/overview.test.ts`
- Create: `src/components/admin/admin-overview-screen.tsx`
- Create: `src/components/admin/admin-overview-screen.test.tsx`

**Interfaces:**
- Produces: `AdminOverviewDTO` containing bounded counts, dependency health, queue counts, recent failures, and recent audit events.
- `GET /api/admin/overview` returns `{ data: AdminOverviewDTO }` and `Cache-Control: private, no-store`.

- [ ] **Step 1: Write failing DTO and endpoint tests**

```ts
it("returns bounded operational totals without secret fields", async () => {
  const dto = await loadAdminOverview(fakeSources);
  expect(dto).toMatchObject({ workspaces: { active: 2, suspended: 1 }, users: { active: 4 }, health: { database: "ok", redis: "ok" } });
  expect(JSON.stringify(dto)).not.toMatch(/token|secret|password/i);
  expect(dto.operatorTape).toHaveLength(20);
});
```

Route tests prove non-owners receive `403`, AAL1 receives `428`, and owner responses are `no-store`.

- [ ] **Step 2: Run and verify RED**

Run: `pnpm vitest run src/lib/admin/overview.test.ts app/api/admin/overview/route.test.ts src/components/admin/admin-overview-screen.test.tsx`

Expected: FAIL because overview modules do not exist.

- [ ] **Step 3: Implement aggregate loaders and UI**

Query bounded counts from Prisma, existing `/api/health` logic, BullMQ queue counts, and the latest 20 failure/audit items. Render the operator tape as the signature chronological surface, followed by concise operational cards and explicit empty/error states.

- [ ] **Step 4: Verify Phase 1**

Run: `pnpm vitest run src/lib/admin app/api/admin src/components/admin src/lib/site-routing.test.ts src/proxy-coverage.test.ts && pnpm typecheck && pnpm lint && pnpm prisma validate && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/admin/page.tsx app/admin/loading.tsx app/api/admin/overview src/lib/admin/overview.ts src/lib/admin/overview.test.ts src/components/admin/admin-overview-screen.tsx src/components/admin/admin-overview-screen.test.tsx
git commit -m "feat(admin): add operational overview"
```

## Phase 1 Completion Gate

- [ ] Exact UUID allowlisting fails closed in production.
- [ ] AAL1 can reach only the security enrollment screen; AAL2 reaches admin data.
- [ ] Non-owner page and API requests expose no admin data.
- [ ] Audit rows are redacted and append-only.
- [ ] AdminShell matches Linkar layout behavior on desktop and mobile.
- [ ] Overview reports real bounded state and no secrets.
