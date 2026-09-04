# Inbox operations and production readiness release

## Release

- Deployed at: `2026-09-04T09:47:00Z`
- Release commit: `7e33afbebeacab2454a63d6e25d13a51d5e30b6a`
- Previous production / rollback image reference: `cdd4381eb9e630b913b7f0a16fa299b30903c902`
- Production container workflow: `https://github.com/linkar0912/main/actions/runs/33854796878` (passed)
- CI workflow: `https://github.com/linkar0912/main/actions/runs/33854796745` (passed)
- Prisma migrations: 45; `prisma migrate status` reported up to date after deployment.
- New migration: `20260904130000_add_inbox_operational_state`

## Backup and rollback evidence

- Pre-deploy custom-format PostgreSQL dump: `/Users/tejastelkar/Documents/Linkar Backups/linkar-pre-inbox-operations-2026-09-04T08-42-40-120Z.dump`
- Size: 630,180 bytes
- Mode: `600`
- SHA-256: `15640f72009ae11e25e94a2e7223a160bd36a83be70d8fd6abbfb0eb70e3044d`
- Application rollback is the previous image/reference above. The additive database migration should not be reversed solely for an application rollback.

## Verification

- Local unit suite: 240 files passed, 1,247 tests passed.
- Lint: passed.
- Typecheck: passed.
- Production Next.js and worker build: passed.
- Playwright: 63 tests passed.
- PostgreSQL 17 migration rehearsal: passed from an empty database and from the 44-migration pre-change state.
- Historical migration repair: removed RLS statements for legacy auth tables already dropped by the immediately preceding migration; both rehearsal paths pass and the connected database remains up to date.
- Coolify service variable `FOLLOW_GATED_CAMPAIGNS_ENABLED=true` is explicit, runtime-enabled, and shared by the Compose environment used by web and worker.
- Production `/api/health`: `status=ok`, `mode=configured`, `database=ok`, `redis=ok`, `instagram=configured`, `facebook=configured`, `followGatedCampaigns=enabled`, release `7e33afbebeacab2454a63d6e25d13a51d5e30b6a`.
- Cross-subdomain OAuth is fixed: secure auth and OAuth-state cookies share `linkar.in` only for trusted HTTPS app/admin origins, and successful OAuth redirects preserve `/admin/*` destinations.
- Authenticated production surfaces passed without console errors: Dashboard, Instagram Inbox, Facebook Page activity, Contacts, Automations, Settings, and Insights.
- Owner System: route reached the admin login page. Full authenticated browser verification remains `BLOCKED` until an owner completes the live OAuth/password sign-in; the previous Google attempt exposed the cross-subdomain state issue now fixed in this release.

## Controlled Meta smoke tests

The production workspace used for verification is in Demo mode with zero connected channels, zero contacts, and zero automations. No reviewer-safe test post or designated secondary Meta account was available. The following provider-backed checks are therefore recorded as blocked rather than simulated:

| Flow | Result | External dependency |
| --- | --- | --- |
| Instagram comment to DM | `BLOCKED` | Connect a professional Instagram account, create an isolated automation/test post, and provide a secondary Instagram test account. |
| Follow-gated delivery | `BLOCKED` | Same Instagram prerequisites, plus a secondary account that can begin unfollowed and follow during the test. |
| Inbox text reply | `BLOCKED` | A real inbound Instagram contact within the 24-hour messaging window is required. |
| Facebook Page public-comment reply | `BLOCKED` | Connect a Facebook Page, create an isolated Page-comment automation/test post, and provide a separate Facebook test account. |

When those provider dependencies are available, record timestamp, automation name/ID, safe event or delivery ID, expected count, actual count, and pass/fail here. Do not add attachments, image messages, voice messages, notes, Facebook Messenger, or WhatsApp as part of these checks.
