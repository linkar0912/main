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
endpoint and private worker health endpoint both report that baked commit, and
the worker's Redis heartbeat (`linkar:worker:heartbeat`, 90-second TTL) carries
its commit into the web health detail as `worker.release`.

Both containers run the image's `HEALTHCHECK` (`scripts/container-healthcheck.mjs`):
it probes `/api/health` on the web port and falls back to the worker's private
`/health` when nothing listens on the web port, so the same image is healthy
in either role. The HTTP status follows each container's own dependencies; a
stopped worker never fails the web container's healthcheck.

## Release flow

A push to `main` is a production deployment once CI passes. Do not push
`main` merely to save unfinished work.

1. `.github/workflows/ci.yml` runs lint, typecheck, unit tests, the repository
   checks (`check:deployment-hygiene`, `check:branding`, `check:copy`), the
   release-bridge shell tests, the full production `pnpm build`, a migrations
   job (every committed migration applied to a throwaway PostgreSQL, then
   `prisma migrate diff --exit-code` against `schema.prisma`), and the
   Playwright e2e suite against a local Supabase stack.
2. `.github/workflows/container.yml` starts only when that CI run succeeded
   for a push to `main` (`workflow_run`). It builds the exact commit CI
   verified and publishes `ghcr.io/linkar0912/main:sha-<commit>` plus the
   moving `main` tag. `BUILD_COMMIT` is baked into the image. A red CI run
   never publishes or deploys.
3. Its deploy job skips a commit that is no longer the tip of `main` (CI runs
   can finish out of order), then connects to the deployment host as
   `deploybot`. Its SSH key is restricted to `ops/dokploy/forced-deploy.sh`,
   which accepts only `deploy <40-character-lowercase-sha>`. The deploy job is
   in a non-cancelling concurrency group: a newer release queues behind a
   running one instead of killing it mid-SSH.
4. The host release script (template: `ops/dokploy/release-linkar.sh`)
   deploys the exact image SHA to `linkar-web`, waits for `/api/health` to
   report that SHA, then updates the singleton worker and waits for a live
   worker heartbeat on the same SHA.
5. The workflow re-checks production from outside with
   `scripts/check-production-health.mjs` and `EXPECTED_RELEASE` set to the
   commit.

Required GitHub Actions secrets:

- `DOKPLOY_DEPLOY_HOST`
- `DOKPLOY_DEPLOY_KEY`
- `DOKPLOY_DEPLOY_HOST_KEY`
- `HEALTH_DETAIL_TOKEN` (same value as on `linkar-web`; without it the
  post-deploy and scheduled probes can check only the public status)
- `ALERT_WEBHOOK_URL` (optional; the Production health workflow posts a
  Slack-compatible message there when a probe fails)

### Host release script

`ops/dokploy/release-linkar.sh` is the reviewed template of
`/usr/local/libexec/dokploy-release-linkar`. **The installed host copy must
match it.** Change the template, run `sh ops/dokploy/release-linkar.test.sh`,
then install it (root-owned, mode 755). Before the first install, diff it
against the copy already on the host and confirm its Dokploy API calls match
the Dokploy version in use. It reads, all root-owned and mode 600:

- `/etc/dokploy-release/api-key` - the Dokploy API key shared with the other
  release commands;
- `/etc/dokploy-release/linkar-health-token` - the `HEALTH_DETAIL_TOKEN`
  configured on `linkar-web`;
- `/etc/dokploy-release/linkar.env` - `LINKAR_WEB_APPLICATION_ID` and
  `LINKAR_WORKER_APPLICATION_ID`.

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
sh ops/dokploy/release-linkar.test.sh
```

After the workflow completes:

```bash
gh run list --workflow="Build production container" --limit 1
HEALTH_DETAIL_TOKEN=... EXPECTED_RELEASE=<commit> pnpm monitor:production
curl --fail --silent -H "x-health-token: $HEALTH_DETAIL_TOKEN" https://app.linkar.in/api/health
```

Without the `x-health-token` header `/api/health` returns only `{"status": ...}`.
Results are cached in-process for five seconds.

Require all of the following:

- the workflow conclusion is `success`;
- `status` is `ok`;
- database and Redis dependencies are `ok`;
- `release` exactly equals the deployed 40-character commit;
- `worker.heartbeat` is `ok` and `worker.release` equals the same commit;
- Instagram and Facebook configuration states are expected;
- `followGatedCampaigns` is `enabled` for the live feature.

## Release failure triage

Find the failing stage first:

```bash
gh run list --workflow="Build production container" --limit 5
gh run view <run-id> --log-failed
```

- CI failure (`gh run list --workflow=CI`): the container workflow never ran.
  Fix it and push a new commit. Dokploy was not invoked and production is
  unchanged.
- Image build failure: same as above; production is unchanged.
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
- Health reports an older `release` after a green workflow: the previous
  containers are still serving; the requested release did not complete.
- The deploy step logged "not deploying superseded": a newer commit reached
  `main` first and is (or will be) released by its own run.
- `worker.heartbeat` is `stale`: the worker is stopped, cannot reach Valkey,
  or BullMQ stopped consuming. Check the `linkar-worker` logs and its
  `/health`.

The Dokploy panel and API are not published. Reach them from an administrator
machine through an SSH tunnel to the host, on a local port that does not clash
with a running dev server.

## Database migrations

Schema migrations are a separate, operator-run release step; CI proves the
chain applies cleanly and matches `schema.prisma` but never touches the
production database. Back up PostgreSQL first, run only committed migrations
through `prisma migrate deploy` using `DIRECT_URL`, and keep migrations
backward-compatible with both web versions during a start-first rollout. Never
use `prisma migrate dev` or `db:seed` in production.

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

The runtime image contains `scripts/`, `prisma/schema.prisma`, and
`prisma/migrations`, so run the step from the exact image being released,
before pushing `main` (or before the release script moves `linkar-web`):

```bash
docker run --rm --env DIRECT_URL --env DATABASE_URL \
  ghcr.io/linkar0912/main:sha-<commit> pnpm db:migrate:deploy
```

or, once that image is running, inside the `linkar-web` container from the
Dokploy terminal: `pnpm db:migrate:deploy`. `DIRECT_URL` must be present in
that environment.

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
and worker and repeat the health checks. Anonymous `/api/health` callers get
only `status`; the `x-health-token` detail view reports configuration state
and release commits, never credential values or connection details.

Production refuses to boot (web and worker alike) when `DATABASE_URL`,
`REDIS_URL`, the Supabase URL and keys, or `META_TOKEN_ENCRYPTION_KEY` are
missing, when any checklist value is still a `replace-with-…`/`change-me`
placeholder, or when `AUTH_SESSION_SECRET` or a configured channel's webhook
verify token is shorter than 32 characters. `DEMO_MODE=1` is the only way to
run a production build without infrastructure, and never on a public host.
