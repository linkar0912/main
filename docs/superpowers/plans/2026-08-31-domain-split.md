# Linkar Domain Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the public marketing and legal site on `linkar.in` while keeping authentication and the Linkar workspace on `app.linkar.in`.

**Architecture:** Add a small, pure host-routing policy used by Next.js Proxy. The policy redirects app paths from the marketing host to the app host, redirects marketing/legal paths from the app host to the marketing host, and sends the app host root to the authenticated dashboard flow. Set the server-side application URL to the app host and add a separate public-site URL for marketing redirects; keep Meta callbacks on the app host.

**Tech Stack:** Next.js 16 Proxy, TypeScript, Vitest, Coolify Docker Compose, Supabase Auth.

**Spec:** User request in the current task: `linkar.in` is the main website and `app.linkar.in` is the actual app.

## Global Constraints

- Preserve the existing Meta callback/webhook paths on `app.linkar.in`.
- Do not change contact-email configuration or expose any secret values.
- Keep the existing Supabase email-confirmation flow working; confirmation links may enter on the public host and must finish on the app host.
- Do not delete the orphaned PostgreSQL resource or its volume.

### Task 1: Host-routing policy (TDD)

**Files:**
- Create: `src/lib/site-routing.ts`
- Test: `src/lib/site-routing.test.ts`
- Modify: `proxy.ts`

**Interfaces:**
- Produces `resolveHostRedirect(hostname: string, pathname: string): { target: "app" | "marketing"; pathname: string } | null`.
- Produces `isProtectedAppPath(pathname: string): boolean` for the Proxy auth gate.

- [x] **Step 1: Write failing tests**

  Cover marketing-host redirects for `/login` and `/dashboard`, app-host redirects for `/` and `/privacy`, preservation of nested paths, no redirect for the canonical host/path combinations, and protected-path classification.

- [x] **Step 2: Run the routing test and verify it fails**

  Run `pnpm vitest run src/lib/site-routing.test.ts`; expect module/export failures before implementation.

- [x] **Step 3: Implement the minimal routing policy and Proxy integration**

  Add exact host/path-prefix matching, preserve query strings in Proxy redirects, bypass Supabase session checks for public routes, and expand the matcher to include host-routed auth/public paths plus the app root.

- [x] **Step 4: Run the routing and proxy-coverage tests**

  Run `pnpm vitest run src/lib/site-routing.test.ts src/proxy-coverage.test.ts`; expect all tests to pass.

### Task 2: Runtime URL configuration

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `src/lib/runtime-commands.test.ts`
- Modify: `.env.production.example`
- Modify: `docker-compose.coolify.yml`
- Modify: `docker-compose.production.yml`
- Modify: `README.md`
- Modify: `ops/COOLIFY_DEPLOYMENT.md`

**Interfaces:**
- `getServerEnv()` returns `appUrl` for `https://app.linkar.in` and `publicSiteUrl` for `https://linkar.in` in production.

- [x] **Step 1: Add failing environment assertions**

  Assert that the server application URL is the app host and that the public-site URL is separately parsed and validated.

- [x] **Step 2: Run the focused environment test and verify it fails**

  Run `pnpm vitest run src/lib/runtime-commands.test.ts`; expect the current root-domain assertion to fail.

- [x] **Step 3: Implement the environment split**

  Add `PUBLIC_SITE_URL`/`publicSiteUrl`, set production examples and compose defaults to the two canonical hosts, and document that `APP_URL` is the app origin.

- [x] **Step 4: Run focused tests and compose validation** (Docker CLI unavailable locally; TypeScript, lint, build, and focused tests passed.)

  Run `pnpm vitest run src/lib/runtime-commands.test.ts` and `pnpm check:compose`.

### Task 3: Reviewer-facing URL documentation

**Files:**
- Modify: `docs/meta-app-review.md`

- [x] **Step 1: Update public policy/support URLs**

  Point privacy, terms, data-deletion, support, and the main website to `https://linkar.in`; keep OAuth, webhook, and deletion callback URLs on `https://app.linkar.in`.

- [x] **Step 2: Run a documentation/configuration consistency check**

  Run `rg -n "APP_URL|PUBLIC_SITE_URL|linkar\.in|app\.linkar\.in" .env.production.example docker-compose.coolify.yml docker-compose.production.yml docs/meta-app-review.md ops/COOLIFY_DEPLOYMENT.md` and inspect the resulting split.

### Task 4: Apply and verify production configuration

**Files/Systems:** Coolify service `alzmminzroqpaftmprqt6lny`, Supabase URL configuration, Meta app review URLs.

- [x] **Step 1: Set Coolify runtime URLs**

  Set `APP_URL=https://app.linkar.in` and `PUBLIC_SITE_URL=https://linkar.in`; preserve all existing secrets and callback values.

- [x] **Step 2: Deploy the updated image/configuration**

  Deploy through Coolify only after the local tests and compose validation pass.

- [x] **Step 3: Verify host behavior**

  Confirm `linkar.in/` returns the marketing page, `app.linkar.in/` enters the app dashboard/login flow, marketing/legal paths canonicalize to the root host, app paths canonicalize to the app host, and both health endpoints remain 200.

- [x] **Step 4: Report any remaining independent infrastructure state**

  Preserve the excluded orphan PostgreSQL resource; do not delete it as part of this change.
