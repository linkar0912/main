# Task 1 report

## Result

Implemented the ReplyConnect identity rename and configurable public support contact behavior.

## TDD guard evidence

The initial `pnpm check:branding` run was intentionally performed before the rename. It exited with status 1 and reported legacy branding in the copied source, including `.env.example`, `README.md`, Meta data-deletion route/pages, `app/layout.tsx`, `docker-compose.yml`, `docs/meta-app-review.md`, `package.json`, `prisma/seed.ts`, client components, environment/runtime libraries, and the worker.

The guard now scans tracked files, ignores generated/dependency/planning directories, reports every matching file, and passes after the rename.

## Changes

- Added `src/lib/branding.ts` with `PRODUCT_NAME = "ReplyConnect"` and `PRODUCT_MARK = "R"`.
- Added `scripts/check-branding.mjs` and the `check:branding` package script.
- Renamed product-facing identity strings, package/runtime identifiers, workspace seed values, queue/global names, OAuth cookie, deletion confirmation prefix, Docker service values, README, and Meta review runbook references.
- Routed public mail links through `getServerEnv().supportEmail`; default is `support@replyconnect.in`.
- Preserved existing Meta OAuth behavior and requested scopes.
- Updated the first smoke test to require visible `ReplyConnect` branding.

## Verification

- `pnpm check:branding` before rename: expected failure, exit 1.
- `pnpm check:branding && pnpm test src/lib/meta/oauth.test.ts src/lib/meta/client.test.ts`: passed; 2 files and 5 tests.
- `pnpm test`: passed; 14 files and 28 tests.
- `pnpm lint`: passed.
- `pnpm build`: passed; TypeScript compilation and Next production build completed.

## Concerns

- No secret values were added. The default support address remains a placeholder mailbox until the owner supplies the real mailbox.
- The planning document retains the legacy token but is excluded as a planning artifact by the branding guard.
