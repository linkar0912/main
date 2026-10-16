# Linkar production deployment on Dokploy

This is the authoritative production release runbook. Linkar is built by
GitHub Actions, stored in GHCR, and promoted to the Netcup-hosted Dokploy
environment through a restricted release command.

## Production topology

As checked in Dokploy on 16 Oct 2026, the Linkar project (environment
`production`) holds one Application and one Compose. Dokploy's TrackParcel
project runs on the same host and the same Dokploy instance.

- `linkar-web` in this runbook is the Dokploy **Application** "Linkar Web"
  (Swarm service `app-compress-primary-pixel-qjmded`, one replica). Its
  environment is the Application's own Environment tab.
- `linkar-worker` in this runbook is the `worker` service of the Dokploy
  **Compose** "Linkar Production" (type `docker-compose`, project
  `linkar-production-dkirew`, container `linkar-production-dkirew-worker-1`).
  It is the singleton BullMQ worker: the same image with the command
  `node dist/worker.js` (the image's default `CMD` starts the web server
  instead). Its image tag is the Compose environment variable
  `LINKAR_IMAGE_TAG`, and its other variables are the Compose's environment,
  separate from Linkar Web's. A release updates it only after the web is
  healthy on the requested commit. There is no separate worker Application.
- The same Compose also runs Valkey (`valkey/valkey:9.1.1-alpine3.24`, password
  protected, `--appendonly yes`, data on the external volume
  `linkar-valkey-data`, no public port or domain) and defines a one-shot
  `migrate` service (`prisma migrate deploy` on the same image).
- PostgreSQL and Auth are hosted by Supabase.
- Cloudflare routes public HTTPS traffic to Dokploy's Traefik ingress.

A Dokploy redeploy of the "Linkar Production" Compose recreates its services,
Valkey included (seen on 16 Oct 2026). Valkey's data survives on its volume,
but jobs wait while it restarts, so update the worker through the release
script rather than a Compose redeploy when you only need a new image.

The web and worker must run the same immutable image commit. The web health
endpoint and private worker health endpoint both report that baked commit, and
the worker's Redis heartbeat (`linkar:worker:heartbeat`, 90-second TTL) carries
its commit into the web health detail as `worker.release`.

### Health checks

The image's `HEALTHCHECK` runs `node scripts/container-healthcheck.mjs` every
30 s (10 s timeout, 40 s start period, 3 retries). It probes the liveness route
`/api/health/live` on the web port and falls back to the worker's private
`/live` when nothing listens on the web port, so the same image is healthy in
either role. The runtime image has no `curl` or `wget`, so any check must run
`node`.

A health check set in Dokploy replaces the image's `HEALTHCHECK`; it does not
run alongside it. Both services therefore carry an explicit liveness check,
set on 16 Oct 2026. Never point either one at `/api/health` or the worker's
`/health`: those follow the database and Redis, and a dependency blip would
then take the service down.

- **`linkar-web`** (Linkar Web, Advanced, Swarm Settings, Health Check) uses
  the image's own check. Docker takes the durations in nanoseconds (Interval
  30 s, Timeout 10 s, StartPeriod 40 s):

  ```json
  {
    "Test": ["CMD", "node", "scripts/container-healthcheck.mjs"],
    "Interval": 30000000000,
    "Timeout": 10000000000,
    "StartPeriod": 40000000000,
    "Retries": 3
  }
  ```

  Swarm replaces a task that fails it, so a stuck web process is restarted.
  Before 16 Oct this field read the dependencies from `/api/health`, so a
  database or Redis outage could replace the only web task.

- **`linkar-worker`** is set in the "Linkar Production" Compose file, under the
  `worker` service's `healthcheck:`. It runs
  `node -e "fetch('http://127.0.0.1:3001/live')..."` every 20 s (8 s timeout,
  30 s start period, 5 retries). Before 16 Oct it probed `/health`.

  The Compose runs under plain `docker compose`, not Swarm. In that mode a
  failing check only marks the container `unhealthy`; Docker does not
  restart it (a restart policy acts only when the process exits). So a worker
  whose BullMQ connection is stuck (see `/live` below) is flagged, not
  replaced. Watch for an `unhealthy` worker in Dokploy, and restart it there.
  Making the worker exit on its own when `/live` stays failed, so the
  Compose restart policy brings it back, is an open follow-up (confirm the
  `worker` service has one, such as `restart: unless-stopped`; Valkey's does).

What each liveness endpoint checks:

- The web `/api/health/live` does no database or Redis I/O and answers
  whenever the process can serve a request. A Valkey restart, a pooler blip or
  a slow database never gets the web container replaced, and a stopped worker
  never fails it.
- The worker's `/live` sends no command either, but answers 200 only while
  both BullMQ consumers are running on ready Redis connections, BullMQ's
  dedicated blocking clients included (`consumersProcessing` in
  `src/lib/worker-health.ts`). It fails while those connections are down, and
  when a blocking client stays stuck reconnecting after Valkey is back (seen
  with BullMQ 6.1.2 and ioredis 6.0.0: the worker stops taking jobs while its
  main connection looks fine). With the Compose check (5 retries, 20 s apart)
  the worker shows as `unhealthy` after about 2 minutes of that. A stuck one
  never recovers by itself and a new worker connects afresh, so restart it
  (see the `linkar-worker` note above: under `docker compose` this is manual
  until the worker can exit on its own). A slow or unreachable database does
  not fail it.

Dependency state is readiness and stays on `/api/health` (web) and the
worker's `/health`, which the release script and monitoring read. Each probe
there has its own deadline (5 s for the database, 2 s for Redis), and the HTTP
status follows that container's own database and Redis.

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

**Known drift (16 Oct 2026): the template does not match production.** Its
worker step calls `application.saveDockerProvider` and `application.deploy`
on `LINKAR_WORKER_APPLICATION_ID`, but there is no worker Application: the
worker is a service of the "Linkar Production" Compose (see "Production
topology"). Releases still move the worker, so the installed host copy must
do it differently. After the 6330420 release the Compose environment's
`LINKAR_IMAGE_TAG` carried that commit and the worker container had been
recreated on it, while Dokploy had recorded no Compose deployment since
6 Sep. **Owner action:** copy the installed
`/usr/local/libexec/dokploy-release-linkar` back over this template so the two
match again, then run `sh ops/dokploy/release-linkar.test.sh`. Until then, do
not install the template on the host: its worker step targets an Application
that does not exist, so it would not move the worker.

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
- `worker.heartbeat` is `stale`, or Dokploy shows the worker `unhealthy`: the
  worker is stopped, cannot reach Valkey, or BullMQ stopped consuming. Open
  the "Linkar Production" Compose in Dokploy, check the `worker` logs, and
  restart the worker; under `docker compose` an unhealthy worker is not
  restarted for you.

The Dokploy panel and API are not published: Dokploy listens only on the
host's `localhost:3000`. Reach them from an administrator machine through an
SSH tunnel, on a local port that does not clash with a running dev server, for
example:

```bash
ssh -N -L 3999:localhost:3000 root@<host>
```

The panel is then at `http://localhost:3999`, and the API at
`http://localhost:3999/api` with an `x-api-key` header. Close the tunnel when
you are done. Cloudflare answers 403 to some scripted clients (Python's
default user agent among them), so send a normal `User-Agent` when a script
checks the public site.

## Database migrations

Schema migrations are a separate, operator-run release step; CI proves the
chain applies cleanly and matches `schema.prisma` but never touches the
production database. Back up PostgreSQL first, run only committed migrations
through `prisma migrate deploy` using `DIRECT_URL`, and keep migrations
backward-compatible with both web versions during a start-first rollout. Never
use `prisma migrate dev` or `db:seed` in production.

If a migration fails, stop the release and inspect `_prisma_migrations` before
retrying. Do not edit or delete migration history to force a deployment.

The "Linkar Production" Compose also defines a one-shot `migrate` service
(`prisma migrate deploy` on the release image). Whether a release runs it
depends on how the installed host release script brings the worker up, which
is not confirmed (see "Known drift" under "Host release script"). A Dokploy
Compose redeploy brings up the whole Compose. Until that is settled, keep
running the step below yourself, and check `_prisma_migrations` after a
release that adds migrations.

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
start a second worker concurrently. Prefer the release script over a Dokploy
redeploy of the "Linkar Production" Compose, which restarts Valkey as well.

## Production configuration

Store production values in Dokploy. Never place secrets in this repository,
GitHub logs, deployment commands, tickets, or audit reasons. Use
`.env.production.example` as the variable-name checklist and run:

```bash
pnpm preflight:billing
pnpm preflight:instagram-ownership
```

The web and the worker keep separate environments: Linkar Web's Environment
tab, and the "Linkar Production" Compose's environment. A variable both use
must be set in both. Rotate a credential in its provider and in both Dokploy
environments together, then deploy both web and worker and repeat the health
checks. Anonymous `/api/health` callers get
only `status`; the `x-health-token` detail view reports configuration state
and release commits, never credential values or connection details.

Production refuses to boot (web and worker alike) when `DATABASE_URL`,
`REDIS_URL`, the Supabase URL and keys, or `META_TOKEN_ENCRYPTION_KEY` are
missing, when any checklist value is still a `replace-with-…`/`change-me`
placeholder, or when `AUTH_SESSION_SECRET` or a configured channel's webhook
verify token is shorter than 32 characters. `DEMO_MODE=1` is the only way to
run a production build without infrastructure, and never on a public host.

Also required in production, though not checked at boot:

- `TRUSTED_PROXY_HOPS=1` on `linkar-web` (traffic arrives through the
  Cloudflare Tunnel, so `cf-connecting-ip` identifies the visitor). With `0`,
  or unset, the app ignores `cf-connecting-ip` and `X-Forwarded-For` and every
  visitor is `unknown`: the per-network sign-in and sign-up caps are skipped,
  everyone trying one email shares its lockout, and tracked-link clicks cannot
  tell visitors apart, so `/r/<slug>` counts them without the per-visitor cap.
  The app still starts; `/r/<slug>` logs a warning once per process instead.
  Set on Linkar Web as of 16 Oct 2026. The worker does not need it.
- `DIRECT_URL` on both `linkar-web` (migrations) and `linkar-worker` (its
  runtime connection unless `WORKER_DATABASE_URL` is set). The Compose
  environment had it, and no `WORKER_DATABASE_URL`, on 16 Oct 2026.
- `PRIVATE_REPLY_RATE_LIMIT_PER_HOUR` is best left unset, so the code default
  (400 an hour) applies. An old template set 750, which overrides it. It was
  unset in both environments on 16 Oct 2026.

### Google Analytics (public website)

GA4 (`G-CLMXQ4YFD1`) runs on the public website only: the pages listed in
`ANALYTICS_PAGE_PATHS` (`src/lib/analytics-path.ts`) - home, pricing, legal,
support, contact, sign-in and sign-up. The signed-in app, the owner console,
`/reset-password` and `/data-deletion/status/*` never load it, and the Content
Security Policy allows Google's hosts on those pages only.

The ID is a build-time value, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, passed as a
Docker build arg by `.github/workflows/container.yml`. Setting it in Dokploy
does nothing; edit the workflow to point at another property. Builds without
it (local, CI, e2e) render no tag and no cookie notice.

Consent Mode v2: advertising storage is always denied. Analytics storage
starts denied in the EEA, the UK and Switzerland (Google matches the IP
address) and for visitors in a European time zone, who also see the cookie
notice; everywhere else it starts granted. Visitors change their choice on
`/cookies`, which Google Analytics then respects on every later visit.

Verify after a release:

1. Install the Google Analytics Debugger extension (or open
   `https://linkar.in/?gtm_debug=x`), browse a few pages, and watch GA4
   Admin -> DebugView: one `page_view` per page, `page_location` with no query
   string.
2. In DevTools -> Network, filter `gtag/js`: exactly one load per page, and
   no Content Security Policy errors in the console.
3. Once, in GA4 Admin -> Data streams -> Enhanced measurement -> Page views,
   turn **off** "Page changes based on browser history events". The site sends
   its own `page_view` on every client-side navigation with the query string
   removed; a history-based one would count some pages twice and with the
   previous page's address.
4. Cloudflare Web Analytics is allowed on the same public pages only. To stop
   its beacon being blocked (and logged) inside the app, limit the Web
   Analytics site to `linkar.in`, or turn off automatic setup for
   `app.linkar.in` and `admin.linkar.in`, in the Cloudflare dashboard.
