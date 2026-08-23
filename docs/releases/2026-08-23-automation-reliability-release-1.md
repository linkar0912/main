# Automation reliability — Release 1

Date: 2026-08-23  
Service: `alzmminzroqpaftmprqt6lny`  
Release commit: recorded after integration to `main`

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

Production backup/preflight evidence, image publication, container state, public health, and release-specific smoke observations are appended after each gate completes. Credentials, access tokens, customer messages, and personal data are never included.
