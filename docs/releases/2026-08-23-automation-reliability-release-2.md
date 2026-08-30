# Automation reliability - Release 2

Date: 2026-08-23  
Service: `alzmminzroqpaftmprqt6lny`  
Release commit: pending deployment

## Scope

- Shared immutable outbound-delivery ledger across classic actions, campaigns,
  sequences, broadcasts, lead email, and lead webhooks.
- Atomic per-automation daily send quotas under concurrent workers.
- Resumable multi-action flows and deterministic recipient jobs.
- Expired-claim reconciliation that marks ambiguous outcomes `UNKNOWN` instead
  of silently resending them.
- Durable lead delivery with DNS- and redirect-aware SSRF protection.
- Authenticated, tenant-scoped delivery diagnostics with recipient and payload
  data omitted.
- HTTP 503 only when queue-less inline webhook processing has a retryable
  outcome that requires Meta redelivery.

## Database changes

- `20260823200000_outbound_delivery_ledger`

The migration is additive. It creates `OutboundDelivery` and
`AutomationDailySendCounter`; it does not synthesize or replay historical
provider calls.

## Verification record

Local verification on 2026-08-23 (Asia/Kolkata):

- Branding: passed.
- ESLint: passed with zero warnings.
- TypeScript: passed.
- Vitest: 76 files, 455 tests passed.
- Next.js production build and 234.4 kB worker bundle: passed.
- Playwright: 14 tests passed, including the recipient-safe delivery diagnostics
  surface and the existing classic, campaign, sequence, and account flows.
- PostgreSQL 17.10 clean migration rehearsal: all 19 migrations applied;
  a second deploy reported no pending migrations.
- PostgreSQL 17.10 upgraded rehearsal: the 18 migrations through Release 1
  applied first; Release 2 then applied by itself and a second deploy reported
  no pending migrations.
- Local Compose parsing: unavailable because Docker is not installed in this
  workspace. The live Coolify container graph and health checks remain a
  production deployment gate.

Production deployment evidence is pending. Credentials, access tokens,
customer messages, webhook payloads, and recipient identifiers are
intentionally excluded.
