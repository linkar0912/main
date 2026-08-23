# Automation reliability — Release 1

Date: 2026-08-23  
Service: `alzmminzroqpaftmprqt6lny`  
Release commit: `d9cb99a`

## Scope

- Revocation-aware authentication on every protected automation, sequence, broadcast, activity, and funnel route.
- Consistent automation-definition, name-length, and malformed-JSON validation.
- Tenant-safe sequence enrollment and explicit source-link clearing.
- Exact partial broadcast enqueue accounting with account-aware job identities.
- Visible sequence load failures and complete automation controls.
- Automation-scoped activity, funnel, time-series, media, and CSV data.
- Retry-stable webhook identities, deterministic Instagram-account ownership, sibling-safe account deletion, and broadcast-aware queue cleanup.

## Database changes

- `20260823170000_sequence_tenant_integrity`
- `20260823180000_instagram_account_ownership`

The production operator must capture a PostgreSQL backup and run `pnpm preflight:instagram-ownership` before applying these migrations. A duplicate account ID stops the release; no row is automatically reassigned or removed.

## Verification record

Local verification on 2026-08-23 (Asia/Kolkata):

- Branding: passed.
- ESLint: passed with zero warnings.
- TypeScript: passed.
- Vitest: 65 files, 397 tests passed.
- Next.js production build and worker bundle: passed.
- Playwright: 13 tests passed, including visible sequence errors, explicit source clearing, scoped exports, and revocation-safe parallel sign-out coverage.
- Prisma schema validation and client generation: passed.
- Local Compose parsing: deferred because Docker is not installed in the Codex workspace; CI/production validation remains a deployment gate.

Production verification completed at 2026-08-23 15:50 IST:

- GitHub CI and the production-container publication workflow completed successfully for `d9cb99a`.
- Preflight database size: 9,126 kB.
- Duplicate Instagram-account IDs: 0.
- Pre-migration custom-format backup: 73,187 bytes, SHA-256 `535d9ce01500bf943e0fa6158e5077d495f66242f123f7c2af32d4b2b77b8096`.
- Backup persisted across container recreation with filesystem mode `600`.
- Both Release 1 migrations report a non-null successful completion in `_prisma_migrations`.
- `InstagramConnection_igUserId_key` exists after migration.
- Coolify state: web `running:healthy`, worker running, migrate exited, PostgreSQL and Valkey `running:healthy`.
- Public `/api/health`: HTTP 200, `status=ok`, `mode=configured`, database and Redis `ok`.
- Unauthenticated `/api/automations`, `/api/sequences`, `/api/broadcasts`, and `/api/insights/funnels`: HTTP 401.
- A fresh production CSS asset was fetched successfully. The manually configured `/api/health.release` value remains stale and was not used as deployment evidence.

Credentials, access tokens, customer messages, and personal data are intentionally excluded.
