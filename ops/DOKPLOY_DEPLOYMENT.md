# Linkar production deployment on Dokploy

This is the authoritative production release runbook. Linkar is built by
GitHub Actions, stored in GHCR, and promoted to the Netcup-hosted Dokploy
environment through a restricted release command.

## Production topology

- `linkar-web` is a Dokploy Application with one steady-state replica and a
  start-first update policy.
- `linkar-worker` is the singleton BullMQ worker. A release updates it only
  after the web application is healthy on the requested commit. The worker
  container runs the same image with the command `node dist/worker.js`; the
  image's default `CMD` starts the web server instead.
- Valkey is private, password protected, and persistent. It has no public port
  or domain.
- PostgreSQL and Auth are hosted by Supabase.
- Cloudflare routes public HTTPS traffic to Dokploy's Traefik ingress.

The web and worker must run the same immutable image commit. The web health
endpoint and private worker health endpoint both report that baked commit.

## Release flow

A push to `main` is a production deployment. Do not push `main` merely to save
unfinished work.

1. `.github/workflows/ci.yml` validates generated types, lint, typecheck, unit
   tests, and the worker bundle.
2. `.github/workflows/container.yml` repeats release-critical tests, builds the
   application, and publishes `ghcr.io/linkar0912/main:sha-<commit>` plus the
   moving `main` tag. `BUILD_COMMIT` is baked into the image.
3. The container workflow connects to the deployment host as `deploybot`. Its
   SSH key is restricted to `ops/dokploy/forced-deploy.sh`, which accepts only
   `deploy <40-character-lowercase-sha>`.
4. The host-owned release script deploys the exact image SHA to `linkar-web`,
   waits for public health to report that SHA, then updates the singleton
   worker and verifies its health.

Required GitHub Actions secrets:

- `DOKPLOY_DEPLOY_HOST`
- `DOKPLOY_DEPLOY_KEY`
- `DOKPLOY_DEPLOY_HOST_KEY`

The deploy key must not provide an interactive shell, port forwarding, agent
forwarding, or access to another application's release command.

## Verification

Before merging or pushing a release:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
sh ops/dokploy/forced-deploy.test.sh
```

After the workflow completes:

```bash
gh run list --workflow="Build production container" --limit 1
pnpm monitor:production
curl --fail --silent https://app.linkar.in/api/health
```

Require all of the following:

- the workflow conclusion is `success`;
- `status` is `ok`;
- database and Redis dependencies are `ok`;
- `release` exactly equals the deployed 40-character commit;
- the worker is healthy on the same commit;
- Instagram and Facebook configuration states are expected;
- `followGatedCampaigns` is `enabled` for the live feature.

## Release failure triage

Find the failing stage first:

```bash
gh run list --workflow="Build production container" --limit 5
gh run view <run-id> --log-failed
```

- Verification or build failure: fix it and push a new commit. Dokploy was not
  invoked and production is unchanged.
- SSH or host-key failure: check the three `DOKPLOY_DEPLOY_*` secrets and the
  `deploybot` authorized key. The pinned host key must come from the live server
  and match the fingerprint in the provider's provisioning email. Never disable
  host verification.
- The deploy step prints `curl: (22) ... 401` after SSH connected: the SSH key is
  fine, but the Dokploy API key used by the host-side release script
  (`/etc/dokploy-release/api-key`, shared by the Linkar and TrackParcel release
  commands) is no longer accepted. Create a new API key in Dokploy, write it to
  that file (mode 600, no extra characters), confirm
  `curl -H "x-api-key: $(cat /etc/dokploy-release/api-key)" http://localhost:3000/api/project.all`
  returns 200, then re-run the failed workflow. Production keeps serving the
  previous release while this is broken.
- Public health reports an older `release` after a green workflow: the previous
  containers are still serving; the requested release did not complete.

The Dokploy panel and API are not published. Reach them from an administrator
machine through an SSH tunnel to the host, on a local port that does not clash
with a running dev server.

## Database migrations

Schema migrations are a separate operation. Back up PostgreSQL first, run only
committed migrations through `prisma migrate deploy` using `DIRECT_URL`, and
keep migrations backward-compatible with both web versions during a start-first
rollout. Never use `prisma migrate dev` or `db:seed` in production.

If a migration fails, stop the release and inspect `_prisma_migrations` before
retrying. Do not edit or delete migration history to force a deployment.

Run migrations on the **direct** connection (port 5432), not the pooled one:
`DATABASE_URL` in production points at the transaction pooler, which cannot run
`CREATE INDEX CONCURRENTLY`.

```bash
pnpm db:migrate:deploy
```

The script runs `prisma migrate deploy` with `DATABASE_URL` taken from
`DIRECT_URL` whenever it is set (see `scripts/migrate-deploy.mjs`), falling
back to `DATABASE_URL` only when no direct URL is configured.

### Migrations that add indexed columns

Adding a column, backfilling it, and indexing it on a busy table are operations
with different locking behaviour, so they are separated (`20260921180000` and
`20260921180200` plus `scripts/backfill-webhook-event-actors.mjs` are the worked
example):

1. A migration adds the column as nullable. It is catalog-only, with no rewrite.
2. A batched, idempotent script backfills existing rows in small committed
   batches. It is a script, not a migration, because one migration is one
   transaction and would lock and bloat a large table.
3. A migration creates the index with `CREATE INDEX CONCURRENTLY` as the only
   statement in its file. It cannot run inside a transaction block, and it must
   not block inserts on a table that takes live webhook traffic.

Release order when new code reads the new column:

1. Back up PostgreSQL.
2. Apply the migrations with the command above, before pushing `main`.
3. Run the backfill so existing rows are ready before the code that reads them:

   ```bash
   DATABASE_URL="$DIRECT_URL" pnpm backfill:webhook-event-actors
   ```

   Progress goes to stderr; the final line is JSON and `remaining` must be `0`.
   `BACKFILL_BATCH_SIZE` (default 2000) tunes the batch size.
4. Push `main` and wait for the release to pass the checks in "Verification".
5. Run the same backfill once more. The previous release keeps writing rows
   without the new columns until the new one is live, and this catches them.
   It is safe to repeat: it never overwrites a value that is already set.
6. Confirm the index is valid (a failed concurrent build leaves an invalid
   index that must be dropped and rebuilt):

   ```bash
   psql "$DIRECT_URL" -c "SELECT relname, indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE relname LIKE 'WebhookEvent_workspaceId_accountId%';"
   ```

Test a new migration chain and any backfill script against a throwaway local
PostgreSQL with an explicit `DATABASE_URL` before they touch production. Never
point a local command at the production database.

## Release failure triage

Find the failing stage first:

```bash
gh run list --workflow="Build production container" --limit 5
gh run view <run-id> --log-failed
```

- Verification or build failure: fix it and push a new commit. Dokploy was not
  invoked and production is unchanged.
- SSH or host-key failure: check the three `DOKPLOY_DEPLOY_*` secrets and the
  `deploybot` authorized key. The pinned host key must come from the live server
  and match the fingerprint in the provider's provisioning email. Never disable
  host verification.
- The deploy step prints `curl: (22) ... 401` after SSH connected: the SSH key is
  fine, but the Dokploy API key used by the host-side release script
  (`/etc/dokploy-release/api-key`, shared by the Linkar and TrackParcel release
  commands) is no longer accepted. Create a new API key in Dokploy, write it to
  that file (mode 600, no extra characters), confirm
  `curl -H "x-api-key: $(cat /etc/dokploy-release/api-key)" http://localhost:3000/api/project.all`
  returns 200, then re-run the failed workflow. Production keeps serving the
  previous release while this is broken.
- Public health reports an older `release` after a green workflow: the previous
  containers are still serving; the requested release did not complete.

The Dokploy panel and API are not published. Reach them from an administrator
machine through an SSH tunnel to the host, on a local port that does not clash
with a running dev server.

## Database migrations

Schema migrations are a separate operation. Back up PostgreSQL first, run only
committed migrations through `prisma migrate deploy` using `DIRECT_URL`, and
keep migrations backward-compatible with both web versions during a start-first
rollout. Never use `prisma migrate dev` or `db:seed` in production.

If a migration fails, stop the release and inspect `_prisma_migrations` before
retrying. Do not edit or delete migration history to force a deployment.

Run migrations on the **direct** connection (port 5432), not the pooled one:
`DATABASE_URL` in production points at the transaction pooler, which cannot run
`CREATE INDEX CONCURRENTLY`.

```bash
pnpm db:migrate:deploy
```

The script runs `prisma migrate deploy` with `DATABASE_URL` taken from
`DIRECT_URL` whenever it is set (see `scripts/migrate-deploy.mjs`), falling
back to `DATABASE_URL` only when no direct URL is configured.

### Migrations that add indexed columns

Adding a column, backfilling it, and indexing it on a busy table is three
operations with different locking behaviour, so ship them as three migrations
in this order (`20260921180000` to `20260921180200` is the worked example):

1. Add the column as nullable. It is catalog-only, with no rewrite.
2. Backfill it with an idempotent `UPDATE ... WHERE <column> IS NULL`.
3. Create the index with `CREATE INDEX CONCURRENTLY` as the only statement in
   its own migration file. It cannot run inside a transaction block, and it
   must not block inserts on a table that takes live webhook traffic.

Release order when new code reads the new column:

1. Back up PostgreSQL.
2. Apply the migrations with the command above, before pushing `main`.
3. Push `main` and wait for the release to pass the checks in "Verification".
4. Run the idempotent backfill once more to catch rows the previous release wrote
   between step 2 and the new release going live, then confirm nothing is left:

   ```bash
   psql "$DIRECT_URL" -f prisma/migrations/20260921180100_webhook_event_actor_backfill/migration.sql
   psql "$DIRECT_URL" -c "SELECT count(*) FROM \"WebhookEvent\" WHERE payload ? 'accountId' AND \"accountId\" IS NULL;"
   ```

   The count must be `0`. Until this runs, conversations may omit the few events
   received during the deploy window.
5. Confirm the index is valid (a failed concurrent build leaves an invalid
   index that must be dropped and rebuilt):

   ```bash
   psql "$DIRECT_URL" -c "SELECT relname, indisvalid FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE relname LIKE 'WebhookEvent_workspaceId_accountId%';"
   ```

Test a new migration chain against a throwaway local PostgreSQL with an
explicit `DATABASE_URL` before it touches production. Never point a local
command at the production database.

## Rollback

Rollback uses the last known-good immutable SHA, not a moving tag. An authorized
host operator runs the installed release script with that SHA:

```bash
sudo -n /usr/local/libexec/dokploy-release-linkar <40-character-commit>
```

Verify public and worker health report the rollback SHA. Do not reverse an
additive database migration during an application rollback. If the failed
release contained an incompatible migration, stop and restore through the
database recovery procedure instead of guessing.

Keep Valkey and its named volume running during web or worker rollback. Never
start a second worker concurrently.

## Production configuration

Store production values in Dokploy. Never place secrets in this repository,
GitHub logs, deployment commands, tickets, or audit reasons. Use
`.env.production.example` as the variable-name checklist and run:

```bash
pnpm preflight:billing
pnpm preflight:instagram-ownership
```

Rotate a credential in its provider and Dokploy together, then deploy both web
and worker and repeat the health checks. The public health response reports
configuration state only; it never returns credential values or connection
details.
