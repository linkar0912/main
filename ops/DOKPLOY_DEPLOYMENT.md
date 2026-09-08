# Linkar production deployment on Dokploy

This is the authoritative production release runbook. Linkar is built by
GitHub Actions, stored in GHCR, and promoted to the Netcup-hosted Dokploy
environment through a restricted release command.

## Production topology

- `linkar-web` is a Dokploy Application with one steady-state replica and a
  start-first update policy.
- `linkar-worker` is the singleton BullMQ worker. A release updates it only
  after the web application is healthy on the requested commit.
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

## Database migrations

Schema migrations are a separate operation. Back up PostgreSQL first, run only
committed migrations through `prisma migrate deploy` using `DIRECT_URL`, and
keep migrations backward-compatible with both web versions during a start-first
rollout. Never use `prisma migrate dev` or `db:seed` in production.

If a migration fails, stop the release and inspect `_prisma_migrations` before
retrying. Do not edit or delete migration history to force a deployment.

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
