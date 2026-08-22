# Linkar production deployment: Coolify behind Cloudflare

Production runs as **one Coolify service** built from the checked-in
[`docker-compose.coolify.yml`](../docker-compose.coolify.yml) — not as separate
applications. Five containers share one image and one private network:

```text
Cloudflare (public HTTPS)
  └── web       ./node_modules/.bin/next start   (only container with a domain)
      worker    node dist/worker.js              (BullMQ -> Meta Graph API)
      migrate   prisma migrate deploy            (one-shot, gates web + worker)
      postgres  postgres:17-alpine               (private, named volume)
      valkey    valkey:9.1.1-alpine3.24          (private, named volume)
```

GitHub Actions builds and publishes `ghcr.io/tejastelkar/replyconnect:main` on
every push to `main`. Coolify only pulls that image; it never runs a Next.js
build on the production host. Create Linkar as its own Coolify project and do
**not** enable *Connect to Predefined Network* — the resource-specific network
and `replyconnect-*` volumes keep this stack separate from TrackParcel.

The Compose file caps each container's CPU and memory. Those ceilings are
deliberate for the shared single-vCPU host; do not remove them without moving
Linkar to a larger server.

The owner supplies the domain, Cloudflare zone access, Meta credentials, and
high-entropy database/Valkey/webhook/encryption secrets. None of those values
live in this repository.

---

## 1. The dependency gate — read this before deploying

This is the single most important thing to understand about the stack, and the
cause of the 2026-08-22 outage.

`web` and `worker` both declare:

```yaml
depends_on:
  migrate:
    condition: service_completed_successfully
```

They will not start until the `migrate` container **exits 0**. If a migration
fails, the whole application stays down — the failure is not isolated to the
database step. Three consequences follow, and each one has bitten this stack:

**A failed migration is sticky.** `prisma migrate deploy` records the failed
attempt in `_prisma_migrations` with `finished_at` NULL. Every later run then
aborts with **P3009 before executing any SQL**. Redeploying cannot clear it —
the fix must be applied to the database by hand (§5).

**A plain redeploy does not re-run the one-shot.** `migrate` is
`restart: "no"`, so Docker leaves the exited container in place with its old
exit code, and the gate keeps reading that stale failure. The containers must
be *recreated* for the one-shot to run again (§5, step 3).

**Coolify's Stop is `docker compose down`.** It removes containers rather than
stopping them, which also destroys their logs. Never interleave Stop with an
in-flight Deploy; use the force/recreate option on Deploy instead.

---

## 2. Provision private data services

PostgreSQL and Valkey are defined inside the Compose file and are reachable
only on the service's private network. They must have **no public ports and no
FQDN**.

Their data lives in the named volumes `replyconnect-postgres` and
`replyconnect-valkey`. Deleting the Coolify service deletes those volumes and
every workspace, contact, and automation with them. There is no undo.

Environment values Compose requires (`?` means the deploy fails fast if unset):

| Variable | Notes |
| --- | --- |
| `POSTGRES_PASSWORD` | required |
| `VALKEY_PASSWORD` | required |
| `AUTH_SESSION_SECRET` | required, ≥ 32 characters |
| `META_TOKEN_ENCRYPTION_KEY` | required |
| `META_REDIRECT_URI`, `META_VERIFY_TOKEN` | required, must match Meta exactly |
| `NEXT_PUBLIC_APP_URL`, `SUPPORT_EMAIL` | required |
| `POSTGRES_USER`, `POSTGRES_DB` | default `replyconnect` |

`DATABASE_URL` and `REDIS_URL` are assembled inside the Compose file from those
values against the in-network hostnames `postgres` and `valkey`. Do not set
them by hand.

`NEXT_PUBLIC_APP_URL` is inlined at **image build time**, not read at runtime.
Changing it requires a rebuild, not just a redeploy — a mismatch sends every
unauthenticated request to the wrong host on redirect.

---

## 3. Route the web app through Cloudflare

Set `NEXT_PUBLIC_APP_URL` to `https://<linkar-domain>` and use matching HTTPS
URLs throughout Meta and Coolify. Create the DNS record for the web container
with proxying enabled, and use Full (strict) TLS with a valid origin
certificate.

Lock the origin to Cloudflare. Preferred: a Cloudflare Tunnel with public
inbound TCP 80/443 closed on the server firewall. Alternative: allow 80/443
only from Cloudflare's published ranges. Keep SSH limited to the owner's
management network.

Never route Cloudflare, a public hostname, or any port to `worker`, `postgres`,
or `valkey`.

---

## 4. Normal release

1. **Merge to `main`.** CI runs lint, typecheck, and the unit suite; the
   container workflow publishes `ghcr.io/tejastelkar/replyconnect:main`.
2. **Wait for both workflows to go green.** Deploying before the image is
   published just redeploys the previous build.
   ```bash
   gh run list --workflow="Build production container" --limit 1
   ```
3. **Back up PostgreSQL** if the release contains a migration (§6).
4. **Deploy.** Press Deploy in Coolify, or call the restart endpoint:
   ```bash
   curl -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
     "$COOLIFY_HOST/api/v1/services/$SERVICE_UUID/restart"
   ```
   **Do not rely on the deploy webhook for a release.** Against a stack that is
   already running, `GET $COOLIFY_DEPLOY_WEBHOOK_URL` answers
   `"Service ReplyConnect started"` and then does nothing: no pull, no
   recreation, no new code. It only has an effect when the containers are
   absent, which is why it appears to work right after a Stop. The restart
   endpoint above performs a real down/up and honours `pull_policy: always`.

   Verify by asset, not by the deploy's own say-so — §5 of this file explains
   why the `release` field cannot be trusted:
   ```bash
   CSS=$(curl -sk https://<linkar-domain>/login \
     | grep -oE '/_next/static/[a-z0-9/_-]+\.css' | head -1)
   curl -sk "https://<linkar-domain>$CSS" | grep -c icon-rail   # 0 = old build
   ```
5. **Watch it settle.** A rollout takes roughly 60–90 seconds and takes the
   *whole stack* down in the middle — a brief window where `postgres` and
   `valkey` also read as exited is normal, not an outage.
   ```bash
   curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
     "$COOLIFY_HOST/api/v1/services/$SERVICE_UUID" \
     | jq -r '((.applications//[])[] , (.databases//[])[]) | "\(.name): \(.status)"'
   ```
   Success looks like: `web: running:healthy`, `worker: running:unknown`,
   `migrate: exited`, `postgres`/`valkey` `running:healthy`.

`worker: running:unknown` is correct — the worker has no healthcheck because it
does not listen on a port. `migrate: exited` is correct for a completed
one-shot.

`web: running:healthy` is meaningful evidence: that healthcheck runs
`fetch('http://127.0.0.1:3000/api/health')` inside the container and fails
unless the response is `ok`.

Then verify from outside:

```bash
curl --fail --show-error https://<linkar-domain>/api/health
```

Require `status: "ok"`, `mode: "configured"`, `dependencies.database: "ok"`
and `dependencies.redis: "ok"`. Inspect worker logs for a clean Redis
connection, then exercise one controlled webhook event before re-enabling
customer automations.

**Ignore the `release` field.** It echoes the `SOURCE_COMMIT` environment
variable, which is set by hand in Coolify and is not updated by a deploy — as
of 2026-08-23 it still reports `2b43339`, many releases old. It will happily
confirm a release that never shipped. Until it is wired to the real commit,
verify with the asset check in step 4.

---

## 5. Recovering a failed migration (P3009)

Symptom: the site is down, `migrate` shows `exited`, and `web`/`worker` never
leave `created`/`starting`. Redeploying changes nothing.

**Step 1 — confirm the diagnosis.** Coolify 4.1.2 has no logs API for compose
services (`/api/v1/services/{uuid}/logs` returns 404), so use the UI logs, or
ask the database directly from the `postgres` container's Terminal:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE finished_at IS NULL;
```

One row with an empty `finished_at` is a wedged migration. No rows at all means
`migrate` never ran the SQL — skip to step 3, it is a container-recreation
problem, not a database problem.

**Step 2 — clear the failed row.** Back up first. Either method works; both
have been verified end-to-end against PostgreSQL 17.

From the `postgres` container Terminal (no app container needed — usually the
easier option, since `web` is not running to exec into):

```sql
DELETE FROM "_prisma_migrations"
WHERE migration_name = '<failed_migration_name>'
  AND finished_at IS NULL;
```

Expect `DELETE 1`. The `AND finished_at IS NULL` guard means it can only ever
match a failed attempt, never a successful migration.

Or, from a one-off container of the release image:

```bash
docker run --rm --network <service-network> -e DATABASE_URL='<url>' \
  ghcr.io/tejastelkar/replyconnect:main \
  ./node_modules/.bin/prisma migrate resolve --rolled-back <failed_migration_name>
```

Both are safe because Postgres DDL is transactional: a failed migration rolls
back completely, leaving no partial tables. Confirm before assuming — if the
migration contains `CREATE INDEX CONCURRENTLY` or similar non-transactional
statements, inspect the schema by hand first.

**Step 3 — recreate the containers.** A plain Deploy leaves the exited one-shot
in place. Use Coolify's **force rebuild / force recreate** option on Deploy. If
the UI offers no such option, press **Stop**, wait for it to finish completely,
then press **Deploy** — never overlap the two.

**Step 4 — verify.**

```sql
SELECT migration_name, finished_at
FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 1;
```

A non-empty `finished_at` means the migration applied; `web` should be healthy
within about 60 seconds.

---

## 6. Writing migrations that cannot wedge production

The 2026-08-22 outage was one duplicated line: a migration re-added a column an
earlier migration had already created, Postgres rejected it with `42701`, and
the P3009 lock-out took the site down until an operator intervened.

- `src/lib/migration-history.test.ts` lints every migration for
  re-declared columns and tables. It runs in CI. Do not skip it.
- Prefer additive, idempotent DDL. `ALTER TYPE ... ADD VALUE IF NOT EXISTS` is
  the safe form for enum labels.
- Adding a `UNIQUE` index to a populated table fails if duplicates exist, and
  that failure wedges the one-shot exactly like a duplicate column. Check for
  duplicates in the same release, before the index is created.
- Test against a real PostgreSQL 17 before merging, applying the migration to a
  database already at the previous revision — not only to an empty one. A fresh
  database applies the whole history in order and hides ordering bugs.
- Back up PostgreSQL before any release containing a migration.

`prisma migrate diff` currently reports one known, pre-existing drift:
`WorkspaceInvitation.tokenHash` is `@unique` in `schema.prisma` but no migration
creates that index, so uniqueness is unenforced in the database. Fixing it needs
the duplicate check described above. Three cosmetic index-name mismatches
(Prisma identifier truncation) are harmless to `migrate deploy`.

---

## 7. Configure Meta after the public health check

Use the final public domain, never a Coolify internal URL:

| Meta setting | Production value |
| --- | --- |
| OAuth redirect URI | `https://<linkar-domain>/api/meta/oauth/callback` |
| Webhooks callback URL | `https://<linkar-domain>/api/meta/webhook` |
| Data deletion callback URL | `https://<linkar-domain>/api/meta/data-deletion` |
| Privacy policy | `https://<linkar-domain>/privacy` |
| Terms of service | `https://<linkar-domain>/terms` |
| Support URL | `https://<linkar-domain>/support` |

Set `META_REDIRECT_URI` to the OAuth row exactly. Keep `META_VERIFY_TOKEN`
server-only and enter the same value in Meta when validating the webhook. See
[`docs/meta-app-review.md`](../docs/meta-app-review.md) for the reviewer test
script and App Review checklist.

---

## 8. Rolling back

Redeploy the last known-good image tag or digest from Coolify's deployment
history.

Do **not** roll back PostgreSQL merely because an application deploy failed,
and do not run a reverse migration unless one has been prepared and tested
against the backup. A schema that has moved forward will usually still serve
the previous image, because migrations here are additive.

If the failure is a data-service incident, recover that private service first
and keep its volume, then repeat the health check and a controlled webhook
delivery. Rotate secrets only for a compromise or a planned rotation.

---

## 9. Quick reference

| Symptom | Cause | Fix |
| --- | --- | --- |
| Site down, `migrate: exited`, redeploy does nothing | Failed migration → P3009 | §5 |
| No new row in `_prisma_migrations` after a deploy | One-shot never recreated (`restart: "no"`) | §5 step 3 |
| Whole stack exited for ~60–90s right after a push | Normal rollout | Wait |
| `web` never leaves `created` | Dependency gate reading a stale failure | §5 step 3 |
| Container logs unavailable in the UI | Stop ran `docker compose down` | Deploy, then read logs |
| Deploy reports success but nothing changes | Webhook no-ops on a running stack | Use the restart endpoint (§4) |
| Redirects point at `localhost:3000` | `NEXT_PUBLIC_APP_URL` wrong at build time | Rebuild the image |
| `worker: running:unknown` | No healthcheck by design | Not a fault |
