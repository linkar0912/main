# Production Monitoring, Alerts, Razorpay Activation, and QA Plan

> **Execution:** Implement inline without subagents. Follow test-driven development and verify evidence before completion.

**Goal:** Finish durable production monitoring and alerts in Linkar Admin, make Razorpay activation observable and verifiable, recover production safely, and complete final visual QA.

**Architecture:** A five-minute worker monitor produces the existing bounded system snapshot, evaluates safe incident candidates, reconciles a Postgres incident ledger, and sends lifecycle-only platform-owner email through Resend. The Admin System screen presents the ledger as a compact operational table. A scheduled GitHub workflow independently probes the public health endpoint so complete host failure is visible outside Linkar.

**Tech Stack:** Next.js 16.3.1, React 19, TypeScript, Prisma/PostgreSQL, BullMQ/Redis, Resend HTTPS API, Vitest, Testing Library, Playwright, GitHub Actions, Coolify/Hostinger.

**Spec:** `docs/superpowers/specs/2026-09-05-production-monitoring-alerts-design.md`

## Task 1: Persist safe incident lifecycles

**Files:** `prisma/schema.prisma`, `prisma/migrations/20260905090000_admin_incidents/migration.sql`, `src/lib/admin/system/incidents.ts`, `src/lib/admin/system/incidents.test.ts`

- [x] Write failing evaluator and lifecycle tests for opening, dedupe, escalation, recovery, recurrence, and redaction.
- [x] Add incident enums/model, indexes, constraints, and RLS with no browser policies.
- [x] Implement pure threshold evaluation plus a repository-backed reconciler.
- [x] Validate Prisma, generate the client, and pass focused tests.

## Task 2: Deliver real owner alerts safely

**Files:** `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/mailer.ts`, `src/lib/mailer.test.ts`, `src/lib/admin/system/alerts.ts`, `src/lib/admin/system/alerts.test.ts`, `.env.example`, `.env.production.example`

- [x] Write failing tests for recipient parsing, Resend requests, missing configuration, delivery failure isolation, and lifecycle dedupe.
- [x] Add server-only `PLATFORM_ALERT_EMAILS` and `EMAIL_FROM` configuration.
- [x] Replace the placeholder mail transport with a bounded Resend HTTPS request and safe error logging.
- [x] Send concise open/escalated/recovered incident messages without secrets.

## Task 3: Run monitoring independently of Admin page visits

**Files:** `src/lib/admin/system/monitor.ts`, `src/lib/admin/system/monitor.test.ts`, `src/worker.ts`, `src/lib/runtime-commands.test.ts`

- [x] Write failing orchestration and worker interval contract tests.
- [x] Add a non-overlapping five-minute worker monitor with startup execution.
- [x] Keep monitoring failure isolated from queue processing and delivery work.

## Task 4: Enrich system snapshots with billing posture

**Files:** `src/lib/admin/system/types.ts`, `src/lib/admin/system/service.ts`, `src/lib/admin/system/service.test.ts`

- [x] Write failing tests for Razorpay configuration presence, failed webhook counts, subscription drift, queue thresholds, and safe projection.
- [x] Add bounded database queries and explicit DTO fields.
- [x] Keep all provider IDs, secrets, webhook payloads, and payment details out of responses.

## Task 5: Redesign Admin System around incidents

**Files:** `src/components/admin/system/system-console.tsx`, `src/components/admin/system/system-console.test.tsx`, `src/components/admin/system/incident-table.tsx`, `app/globals.css`, `app/admin/system/loading.tsx`

- [x] Write failing accessibility and rendering tests for active/recovered incidents and readable non-color-only states.
- [x] Add one operational summary and compact incident table using established Volt tokens.
- [x] Normalize probe and queue presentation, responsive behavior, and dark mode without grey filler or success-green overuse.

## Task 6: Add an external production health probe

**Files:** `scripts/check-production-health.mjs`, `scripts/check-production-health.test.ts`, `.github/workflows/production-health.yml`, `package.json`, `ops/COOLIFY_DEPLOYMENT.md`

- [x] Write failing script tests for HTTP failure, invalid JSON, degraded dependencies, timeout, and success.
- [x] Add a retrying health checker and a five-minute scheduled/manual workflow.
- [x] Document external failure notifications and Hostinger resource-alert setup.

## Task 7: Verify Razorpay activation readiness

**Files:** `scripts/verify-billing-config.mjs`, `scripts/verify-billing-config.test.ts`, `ops/COOLIFY_DEPLOYMENT.md`

- [x] Extend failing tests to cover live HTTPS URLs, key/plan shapes, webhook URL, and production readiness output.
- [x] Keep tests fixture-based; never write or display production secrets.
- [x] Run the preflight with production-shaped placeholders and record remaining external configuration explicitly.

## Task 8: Full local quality gate and visual QA

- [x] Run focused tests after every task.
- [ ] Run `pnpm prisma validate`, `pnpm prisma generate`, full Vitest, lint, typecheck, build, compose validation, branding check, and billing preflight fixtures.
- [x] Run Playwright at desktop/mobile in light/dark for Admin System, Billing, Home, Inbox, and Settings; inspect screenshots for clipping, inconsistent controls, excess decorative chrome, and contrast.

## Task 9: Production recovery and activation

- [ ] Obtain Hostinger hPanel/VPS console access, inspect disk usage, and preserve all volumes.
- [ ] Remove only unused Docker images/build cache/stopped containers, restart Coolify, and verify capacity.
- [ ] Apply migrations, configure verified email plus Razorpay live values and webhook, deploy the tested commit, and verify public/web/worker health.
- [ ] Run Razorpay test-mode checkout lifecycle. Request immediate confirmation before any real ₹199 charge.
- [ ] Complete production desktop/mobile/light/dark smoke and monitoring checks.
