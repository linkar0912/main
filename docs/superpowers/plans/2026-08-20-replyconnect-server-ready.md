# ReplyConnect Server-Ready MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the deterministic Instagram automation MVP into a standalone ReplyConnect project that is branded consistently and deployable on the existing Coolify/Cloudflare server pattern.

**Architecture:** Keep the Next.js dashboard/API and BullMQ worker in one repository but run them as separate long-lived Coolify services. Give ReplyConnect its own PostgreSQL database and private Valkey/Redis service; use Cloudflare only as the public HTTPS edge.

**Tech Stack:** Next.js 16, React 19, TypeScript, Prisma/PostgreSQL, BullMQ, ioredis/Valkey, pnpm, Docker, Coolify, Cloudflare.

**Spec:** `docs/superpowers/specs/2026-08-20-replyconnect-server-ready-design.md`

## Global Constraints

- The public product name is exactly `ReplyConnect` and no legacy product-name reference may remain anywhere in this repository.
- This MVP stays deterministic: no AI SDK, AI-generated copy, scraping, follower blasts, WhatsApp, billing, or bulk cold messaging.
- Meta credentials, token-encryption keys, database credentials, Redis credentials, and verification secrets remain server-only and never enter source control.
- The web service runs `pnpm start`; the worker runs `pnpm worker`; both use the same environment contract.
- PostgreSQL and Valkey are dedicated to ReplyConnect and are not shared with TrackParcel.
- Node.js 24 and pnpm are the supported runtime versions.

---

### Task 1: Replace product identity and make public contact details configurable

**Files:**
- Create: `src/lib/branding.ts`
- Create: `scripts/check-branding.mjs`
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/dashboard-screen.tsx`
- Modify: `src/components/settings-screen.tsx`
- Modify: `src/components/public-page.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/privacy/page.tsx`
- Modify: `app/terms/page.tsx`
- Modify: `app/data-deletion/page.tsx`
- Modify: `app/support/page.tsx`
- Modify: `src/lib/meta/oauth-state.ts`
- Modify: `src/lib/repository-provider.ts`
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/meta/data-deletion.ts`
- Modify: `src/worker.ts`
- Modify: `prisma/seed.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/meta-app-review.md`
- Modify: `e2e/smoke.spec.ts`

**Interfaces:**
- `src/lib/branding.ts` exports `PRODUCT_NAME = "ReplyConnect"` and `PRODUCT_MARK = "R"` for client and server UI.
- `getServerEnv().supportEmail` remains the server-side source for public contact links and defaults to `support@replyconnect.in` until the owner supplies a real mailbox.
- `scripts/check-branding.mjs` exits with status 1 and prints every matching file if a forbidden legacy token is found outside ignored/generated directories.
- `package.json` exposes `check:branding` as `node scripts/check-branding.mjs`.

- [ ] **Step 1: Add the failing branding guard and update the browser assertion.**

  Create `scripts/check-branding.mjs` so it scans tracked project files for `DMSetu` or `dmsetu`, and change the first smoke test to require visible `ReplyConnect` branding. Run `pnpm check:branding` before the rename; it must fail because the copied source still contains legacy references.

- [ ] **Step 2: Run the failing checks and record the expected failure.**

  Run: `pnpm check:branding`

  Expected: non-zero exit with one or more source/doc paths containing the legacy name.

- [ ] **Step 3: Implement the identity rename and configurable support email.**

  Replace all legacy product strings and runtime identifiers in the listed files, route public mail links through `getServerEnv().supportEmail`, use the branding constants in client components, update the package name and environment defaults, and update the Meta runbook to say ReplyConnect. Preserve the existing behavior and scopes.

- [ ] **Step 4: Verify the branding guard and focused tests.**

  Run: `pnpm check:branding && pnpm test src/lib/meta/oauth.test.ts src/lib/meta/client.test.ts`

  Expected: the guard exits 0 and the focused tests pass.

- [ ] **Step 5: Commit the identity change.**

  ```bash
  git add src scripts app prisma package.json .env.example README.md docs/meta-app-review.md e2e
  git commit -m "chore: rebrand MVP as ReplyConnect"
  ```

### Task 2: Add deployment-grade health reporting and migration commands

**Files:**
- Create: `src/lib/health.ts`
- Create: `src/lib/health.test.ts`
- Modify: `app/api/health/route.ts`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- `getHealth(checkers?)` returns `{ status, mode, release, dependencies: { database, redis } }` without exposing connection strings or secrets.
- Dependency states are exactly `ok`, `not_configured`, or `error`.
- A configured dependency failure produces HTTP 503; demo mode remains HTTP 200 with `not_configured` dependencies.
- `package.json` exposes `db:migrate:deploy` as `prisma migrate deploy`.

- [ ] **Step 1: Write health behavior tests first.**

  Add tests for demo mode, configured healthy dependencies, and configured dependency failure using injected async checkers. Assert both the JSON shape and the status decision returned by the helper.

- [ ] **Step 2: Run the health tests and verify they fail for the missing helper.**

  Run: `pnpm test src/lib/health.test.ts`

  Expected: FAIL because `src/lib/health.ts` does not yet export the requested health behavior.

- [ ] **Step 3: Implement the health helper and route.**

  Add lazy Prisma and Redis checks, preserve demo mode when URLs are omitted, return the Coolify commit marker when present, and map failures to a safe degraded response. Do not log or serialize secrets.

- [ ] **Step 4: Run focused and route-adjacent tests.**

  Run: `pnpm test src/lib/health.test.ts src/lib/repository.test.ts src/lib/queue.test.ts`

  Expected: all selected tests pass.

- [ ] **Step 5: Add the deploy migration command and commit.**

  ```bash
  git add src/lib/health.ts src/lib/health.test.ts app/api/health/route.ts package.json README.md
  git commit -m "feat: expose deployment health checks"
  ```

### Task 3: Add Coolify/Cloudflare production packaging

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `.env.production.example`
- Create: `docker-compose.production.yml`
- Create: `ops/COOLIFY_DEPLOYMENT.md`
- Create: `ops/valkey/README.md`
- Modify: `.gitignore`
- Modify: `README.md`

**Interfaces:**
- The production image builds with `pnpm build`, serves the web process on port 3000, and permits the worker command to be overridden to `pnpm worker`.
- The production compose file defines `web`, `worker`, `postgres`, and `valkey`; only `web` publishes port 3000, and data services have health checks but no public ports.
- `.env.production.example` contains names and safe placeholders only, including separate database/Valkey values for the internal compose network.
- `ops/COOLIFY_DEPLOYMENT.md` documents two Coolify applications from the same repository, the migration step, Cloudflare routing, private service requirements, health verification, rollback, and the Meta URLs.

- [ ] **Step 1: Write the production compose validation fixture.**

  Add a package script `check:compose` that runs `docker compose -f docker-compose.production.yml config --quiet`, and add the files with deliberately complete service definitions so the command validates the intended topology.

- [ ] **Step 2: Run compose validation before finalizing documentation.**

  Run: `pnpm check:compose`

  Expected: PASS when Docker is available; if Docker is unavailable, record that as an environment limitation and validate YAML structure with the project’s available tooling.

- [ ] **Step 3: Implement the image, compose services, safe environment template, and operator runbook.**

  Use Node 24 with pnpm, copy only the application and production build artifacts into the runtime image, keep the worker as a long-running command, use a dedicated Valkey password and append-only persistence, and never publish PostgreSQL or Valkey ports. Document that the Coolify build should be moved to CI or a build server if the existing single-vCPU host becomes constrained.

- [ ] **Step 4: Verify deployment files and secret hygiene.**

  Run: `pnpm check:branding && pnpm check:compose`

  Expected: both checks pass and no file contains a credential value.

- [ ] **Step 5: Commit the deployment packaging.**

  ```bash
  git add Dockerfile .dockerignore .env.production.example docker-compose.production.yml ops .gitignore README.md package.json
  git commit -m "chore: add Coolify production packaging"
  ```

### Task 4: Clean verification and handoff checklist

**Files:**
- Modify: `README.md`
- Modify: `docs/meta-app-review.md`

**Interfaces:**
- The README has exact commands for local demo, persistent local stack, production build, worker, health, and deployment.
- The Meta runbook uses ReplyConnect’s public paths and explicitly lists what must still be supplied by the owner.

- [ ] **Step 1: Install from the clean lockfile.**

  Run: `pnpm install --frozen-lockfile`

- [ ] **Step 2: Run the full test, lint, build, and browser verification suite.**

  Run: `pnpm test && pnpm lint && pnpm build && pnpm test:e2e`

  Expected: every command exits 0.

- [ ] **Step 3: Run the final repository checks.**

  Run: `pnpm check:branding && pnpm check:compose && git status --short`

  Expected: no legacy-name matches, valid compose configuration, and only intended project files changed.

- [ ] **Step 4: Commit final documentation and record remaining work.**

  ```bash
  git add README.md docs/meta-app-review.md
  git commit -m "docs: finish ReplyConnect deployment handoff"
  ```

