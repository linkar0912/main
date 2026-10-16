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
  restart it (a restart policy acts only when the process exits). So the
  worker restarts itself: when the `/live` signal has been failing for
  `WORKER_LIVENESS_EXIT_AFTER_MS` (default five minutes, counted from launch;
  `0` turns it off), it logs "Worker stopped consuming jobs; exiting so it
  restarts", waits up to 30 s for running jobs and connections to close, and
  exits with code 1 (`startLivenessWatchdog` in `src/lib/worker-health.ts`).
  Checks run every 10 to 20 s, so a stuck worker is gone five to seven
  minutes after it stopped (up to a minute after its last job, then the
  window, up to two check gaps and the 30 s close).
  The restart policy then starts a fresh worker with new connections. At
  startup the worker logs "Worker liveness watchdog" with the window in
  effect (or `disabled`), and warns when the configured value was not usable
  as written (only `0` turns it off; `off` or `5m` falls back to five
  minutes). An idle queue, a worker that took a job in the last minute, and a
  queue paused from the owner console do not trip it. During a Valkey outage
  longer than the window the worker exits and restarts about every six
  minutes until Valkey is back; that is expected.

  **This needs a restart policy on the `worker` service**; without one an
  exited worker stays down. Checked read-only on 16 Oct 2026 (`docker
  inspect` of the running worker): `restart: unless-stopped`, no retry limit.
  Re-check it after any edit to the Compose file.

  Any shutdown (a deploy's SIGTERM included) also gives up after 30 s and
  exits with code 1, logging "Worker shutdown did not finish; forcing exit",
  since a wedged or unreachable Valkey can hold BullMQ's close for good. The
  `worker` service has `stop_grace_period: 40s` (set 16 Oct 2026; Docker's
  10 s default killed a draining worker before its 25 s drain could finish).
  All three Compose services also cap their logs at 10 MB x 3 files.

What each liveness endpoint checks:

- The web `/api/health/live` does no database or Redis I/O and answers
  whenever the process can serve a request. A Valkey restart, a pooler blip or
  a slow database never gets the web container replaced, and a stopped worker
  never fails it.
- The worker's `/live` sends no command either, but answers 200 only while
  both BullMQ consumers are running and each one either started or finished
  a job in the last minute or is on ready Redis connections, BullMQ's
  dedicated blocking clients included (`consumersProcessing` in
  `src/lib/worker-health.ts`). It fails while those connections are down, and
  when a blocking client stays stuck reconnecting after Valkey is back (seen
  with BullMQ 6.1.2 and ioredis 6.0.0: the worker stops taking jobs while its
  main connection looks fine). A blocking client that BullMQ closed itself
  (`end`) does not fail it: BullMQ reconnects it on its next wait for a job,
  and a worker working through a backlog may not wait for minutes. With the
  Compose check (5 retries, 20 s apart) the worker shows as `unhealthy` after
  about 2 minutes of that. A stuck one never recovers by itself and a new
  worker connects afresh, so it exits five to seven minutes after it stopped
  (up to a minute after its last job, then the window, up to two check gaps
  and the 30 s close) and its restart policy brings it back (see the
  `linkar-worker` note above). A slow or unreachable database does not fail
  it.

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
   `deploybot`. Its SSH key is restricted (`restrict`, forced command) to
   `/usr/local/libexec/dokploy-forced-deploy linkar` (template:
   `ops/dokploy/forced-deploy.sh`), which accepts only
   `deploy <40-character-lowercase-sha>` and runs the release script through
   `sudo -n`. The deploy job is
   in a non-cancelling concurrency group: a newer release queues behind a
   running one instead of killing it mid-SSH.
4. The host release script (template: `ops/dokploy/release-linkar.sh`), one
   release at a time:
   1. applies committed database migrations with the release image (the
      Compose's `migrate` service, on `DIRECT_URL`); a failed migration stops
      the release before anything moves, with the previous release serving;
   2. points `linkar-web` at the exact image SHA, deploys it, and waits until
      public `/api/health` reports that SHA with the database and Redis up,
      three checks in a row (up to 10 minutes);
   3. only then sets `LINKAR_IMAGE_TAG` in the Compose (in Dokploy and in its
      `.env` on disk), recreates just the `worker` service
      (`docker compose up -d --no-deps worker`, so Valkey is not touched),
      and waits for the worker container to report healthy.
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
install it (root-owned, mode 755), and compare checksums:

```bash
sha256sum ops/dokploy/release-linkar.sh
ssh root@<host> sha256sum /usr/local/libexec/dokploy-release-linkar
```

The two matched on 16 Oct 2026, when the migration step was added; the copy
it replaced is kept on the host as
`/usr/local/libexec/dokploy-release-linkar.bak-20261016`. Likewise
`ops/dokploy/forced-deploy.sh` matches `/usr/local/libexec/dokploy-forced-deploy`.

The script carries the production identifiers as defaults (the Linkar Web
Application and Linkar Production Compose ids, the Compose directory
`/etc/dokploy/compose/linkar-production-dkirew/code`, the worker container
name and the lock file `/run/lock/dokploy-release-linkar.lock`); the
environment overrides exist only for its test, and sudo resets the
environment in production anyway. The Compose's project name comes from
`COMPOSE_PROJECT_NAME` in that directory's `.env`, so every `docker compose`
call must pass `--env-file` with it. The only secret it reads is the Dokploy
API key in `/etc/dokploy-release/api-key` (root-owned, mode 600, shared with
the TrackParcel release command).

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
  the "Linkar Production" Compose in Dokploy and check the `worker` logs. A
  worker that stopped consuming exits on its own five to seven minutes later;
  if it keeps exiting, the logs say why (often Valkey down or a wrong
  password). Restart it by hand if it is not coming back.

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

Every release applies the committed migrations itself, as the first step of
the host release script (see "Release flow"), with `prisma migrate deploy` on
`DIRECT_URL` from the release image, while the previous release is still
serving. CI proves the chain applies cleanly and matches `schema.prisma` but
never touches the production database. So every migration must work with the
previous release still running: additive changes, nullable columns, and
`CREATE INDEX CONCURRENTLY` alone in its file. A migration that drops, renames
or rewrites data, or that would hold locks for long, must not ride a release:
back up PostgreSQL, apply it by hand first (commands below), and the release
then finds nothing pending. Never use `prisma migrate dev` or `db:seed` in
production.

If a migration fails, stop the release and inspect `_prisma_migrations` before
retrying. Do not edit or delete migration history to force a deployment.

Releases before 16 Oct 2026 did not run migrations (the old release script
recreated only the worker), and the two migrations of the 6330420 release
were applied by hand that day. If a release ever stops at its migration
step, read its log in the deploy job, fix the cause, and push again.

To apply migrations by hand on the host, with the image of the release they
belong to (the `migrate` service sits in the `migration` profile and never
starts on its own):

```bash
cd /etc/dokploy/compose/linkar-production-dkirew/code
LINKAR_IMAGE_TAG=sha-<commit> docker compose --project-directory . --env-file .env \
  -f docker-compose.yml --profile migration run --rm -T migrate
```

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
2. Apply the migrations with one of the commands above, before pushing
   `main`, so the backfill below can run first (the release then finds them
   applied).
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

It runs the migration step first; with an older image that has nothing to
apply (`prisma migrate deploy` ignores migrations the image does not know).
Verify public and worker health report the rollback SHA. Do not reverse an
additive database migration during an application rollback. If the failed
release contained an incompatible migration, stop and restore through the
database recovery procedure instead of guessing.

Keep Valkey and its named volume running during web or worker rollback. Never
start a second worker concurrently. Prefer the release script over a Dokploy
redeploy of the "Linkar Production" Compose, which restarts Valkey as well.

## Server access and host

As checked on 16 Oct 2026, the Netcup host (Debian 13, 4 vCPU, 8 GB RAM, 4 GB
swap, 157 GB disk) runs Dokploy for both Linkar and TrackParcel.

- **SSH is key-only.** `/etc/ssh/sshd_config.d/00-key-only.conf` sets
  `PasswordAuthentication no`, `KbdInteractiveAuthentication no` and
  `PermitRootLogin prohibit-password` (the file is read before the main
  config, so it wins). Password attempts get `Permission denied (publickey)`;
  until then the host saw well over a thousand failed password logins a day.
  fail2ban runs an `sshd` jail. Keep the administrator key backed up: if
  every key is lost, the way in is the provider's VNC console or rescue
  system. Deleting that file and `systemctl reload ssh` brings passwords back.
- **Deploys** use `deploybot`, whose only key is restricted (`restrict` and a
  forced command) to `/usr/local/libexec/dokploy-forced-deploy linkar` or
  `trackparcel`.
- **Firewall.** ufw allows only SSH. The `DOCKER-USER` chain drops 80, 443 and
  3000 on the public interface, so Traefik and the Dokploy panel are not
  reachable directly (IPv6 checked closed as well). Public traffic arrives
  only through the Cloudflare Tunnels, which run outside Docker as the
  systemd services `cloudflared-linkar` and `cloudflared-trackparcel`.
- **Docker logs.** `/etc/docker/daemon.json` defaults new containers to
  `json-file` with `max-size 10m` and `max-file 3`. It took effect at the
  16 Oct Docker restart for the Swarm services (both web apps, Dokploy and
  its database); containers that were restarted rather than recreated
  (Traefik, the Valkeys, the Linkar worker) keep their old setting until they
  are recreated. The Linkar Compose sets the same cap on its own services.
- **Restarting Docker** (`systemctl restart docker`, needed for daemon.json
  changes) stops every app on the host; on 16 Oct everything was back in
  42 s. Traefik has `restart: always`, the Compose services
  `restart: unless-stopped`, and Swarm reschedules its services.
- **Resource limits:** Linkar Web 1 CPU / 1 GB, Linkar worker 1 CPU / 768 MB,
  Linkar Valkey 0.5 CPU / 512 MB, TrackParcel web 2 CPU / 2 GB. Dokploy has
  none.
- **Updates.** unattended-upgrades applies security updates.

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
