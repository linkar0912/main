# Linkar production deployment: Coolify behind Cloudflare

Production runs as **one Coolify service** built from the checked-in
[`docker-compose.coolify.yml`](../docker-compose.coolify.yml) - not as separate
applications. Four containers share one image and one private network:

```text
Cloudflare (public HTTPS)
  └── web       ./node_modules/.bin/next start   (only container with a domain)
      worker    node dist/worker.js              (BullMQ -> Meta Graph API)
      migrate   prisma migrate deploy            (one-shot, gates web + worker)
      valkey    valkey:9.1.1-alpine3.24          (private, named volume)
```

**Postgres and Auth are hosted on Supabase**, not run in this stack.
`DATABASE_URL` (web/worker) is Supabase's transaction pooler
(`?pgbouncer=true` required); `migrate` needs `DIRECT_URL` instead - Prisma's
migration lock is incompatible with transaction-mode pooling.

GitHub Actions builds and publishes `ghcr.io/linkar0912/main:main` on
every push to `main`. Coolify only pulls that image; it never runs a Next.js
build on the production host. Create Linkar as its own Coolify project and do
**not** enable *Connect to Predefined Network* - the resource-specific network
and `linkar-*` volumes keep this stack separate from TrackParcel.

The Compose file caps each container's CPU and memory. Those ceilings are
deliberate for the shared single-vCPU host; do not remove them without moving
Linkar to a larger server.

The owner supplies the domain, Cloudflare zone access, Meta credentials, and
high-entropy database/Valkey/webhook/encryption secrets. None of those values
live in this repository.

---

## 1. The dependency gate - read this before deploying

This is the single most important thing to understand about the stack, and the
cause of the 2026-08-22 outage.

`web` and `worker` both declare:

```yaml
depends_on:
  migrate:
    condition: service_completed_successfully
```

They will not start until the `migrate` container **exits 0**. If a migration
fails, the whole application stays down - the failure is not isolated to the
database step. Three consequences follow, and each one has bitten this stack:

**A failed migration is sticky.** `prisma migrate deploy` records the failed
attempt in `_prisma_migrations` with `finished_at` NULL. Every later run then
aborts with **P3009 before executing any SQL**. Redeploying cannot clear it -
the fix must be applied to the database by hand (§5).

**A plain redeploy does not re-run the one-shot.** `migrate` is
`restart: "no"`, so Docker leaves the exited container in place with its old
exit code, and the gate keeps reading that stale failure. The containers must
be *recreated* for the one-shot to run again (§5, step 3).

**Coolify's Stop is `docker compose down`.** It removes containers rather than
stopping them, which also destroys their logs. Never interleave Stop with an
in-flight Deploy; use the force/recreate option on Deploy instead.

---

## 2. Provision the data services

**Postgres + Auth: Supabase, not this stack.** Create the project at
supabase.com, link it with `supabase link --project-ref <ref>` (see
`supabase/config.toml`), and apply the committed migration history with
`prisma migrate deploy` using the project's `DIRECT_URL` (port 5432, no
pooling - `migrate deploy` takes a Postgres advisory lock the transaction
pooler doesn't support). RLS is enabled (default-deny) on every table in
`public`; Prisma still reads/writes everything since it connects as the
table owner, which bypasses RLS.

**Valkey** is the only data service still defined inside the Compose file,
reachable only on the service's private network. It must have **no public
port and no FQDN**. Its data lives in the named volume `linkar-valkey`.
Deleting the Coolify service deletes that volume and its queue state - Valkey
itself holds no durable business data (BullMQ job state only), so this is
recoverable by re-running affected jobs, unlike a Postgres loss would be.

Environment values Compose requires (`?` means the deploy fails fast if unset):

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Supabase transaction pooler, port 6543, `?pgbouncer=true` required |
| `DIRECT_URL` | Supabase direct connection, port 5432 - `migrate` only |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | from the Supabase project's API settings |
| `VALKEY_PASSWORD` | required |
| `AUTH_SESSION_SECRET` | required, ≥ 32 characters (HMAC key for login/signup rate-limit keys) |
| `META_TOKEN_ENCRYPTION_KEY` | required |
| `META_REDIRECT_URI`, `META_VERIFY_TOKEN` | required, must match Meta exactly |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | required when Facebook Pages are enabled |
| `FACEBOOK_REDIRECT_URI`, `FACEBOOK_VERIFY_TOKEN` | required when Facebook Pages are enabled, must match the Facebook app exactly |
| `FACEBOOK_TOKEN_ENCRYPTION_KEY` | optional dedicated 64-hex-character key; falls back to `META_TOKEN_ENCRYPTION_KEY` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | required when Google sign-in is enabled; hides the button when unset |
| `GOOGLE_REDIRECT_URI` | required when Google sign-in is enabled, must match the redirect URI registered in Google Cloud Console exactly |
| `APP_URL`, `NEXT_PUBLIC_APP_URL`, `SUPPORT_EMAIL` | required |
| `PUBLIC_SITE_URL` | marketing/legal origin; defaults to `https://linkar.in` |

`REDIS_URL` is assembled inside the Compose file from `VALKEY_PASSWORD`
against the in-network hostname `valkey`. `DATABASE_URL`/`DIRECT_URL` are not
assembled - set them directly from the Supabase project's connection strings.

`NEXT_PUBLIC_APP_URL` is inlined at **image build time**, not read at runtime.
Changing it requires a rebuild, not just a redeploy - the app image must be
built with `https://app.linkar.in`. `APP_URL` is the server-side application
origin used by auth, OAuth, invitation, and dashboard redirects. `PUBLIC_SITE_URL`
is the marketing/legal origin used for host canonicalization. Supabase's
`SiteURL` remains `https://linkar.in` so public email links start from the
marketing domain; the proxy moves `/auth/*` links to the app host while
preserving their query parameters. Keep the Supabase email
templates (Authentication → Emails → Templates) pointed at
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup` (and
`type=recovery` for the reset template) rather than the default
`{{ .ConfirmationURL }}`, which bypasses this app's confirm handler.

---

## 3. Route the web app through Cloudflare

Set `APP_URL` and `NEXT_PUBLIC_APP_URL` to `https://app.linkar.in` for the
application origin, and set `PUBLIC_SITE_URL` to `https://linkar.in` for the
marketing/legal origin. Use matching HTTPS URLs throughout Meta and Coolify.
Create the DNS records for the web container
with proxying enabled, and use Full (strict) TLS with a valid origin
certificate.

Lock the origin to Cloudflare. Preferred: a Cloudflare Tunnel with public
inbound TCP 80/443 closed on the server firewall. Alternative: allow 80/443
only from Cloudflare's published ranges. Keep SSH limited to the owner's
management network.

Never route Cloudflare, a public hostname, or any port to `worker` or
`valkey`.

---

## 4. Normal release

1. **Merge to `main`.** CI runs lint, typecheck, and the unit suite; the
   container workflow publishes `ghcr.io/linkar0912/main:main`.
2. **Run `pnpm deploy:coolify`.** This is the preferred path - it mechanizes
   the rest of this section: confirms the build for the current commit is
   green, refuses to proceed on an unreviewed migration (add
   `-- --migrations-backed-up` once §6 is done), calls the restart endpoint,
   polls until `web` is `running:healthy`, and verifies `/api/health` plus the
   shipped CSS asset from outside the container. It records the deployed SHA
   in `.coolify-deploy-state.json` (gitignored, local-machine only) so the
   next run can diff migrations against it. Needs `COOLIFY_API_TOKEN`,
   `COOLIFY_HOST`, `COOLIFY_PORT`, `COOLIFY_SERVICE_UUID`, and
   `PUBLIC_APP_DOMAIN` in `.env.local`, and `gh` authenticated.

   The steps below are what that script does - use them directly only if the
   script itself is unavailable or its output needs cross-checking by hand.

3. **Wait for both workflows to go green.** Deploying before the image is
   published just redeploys the previous build.
   ```bash
   gh run list --workflow="Build production container" --limit 1
   ```
4. **Back up Supabase Postgres** if the release contains a migration (§6).
5. **Deploy.** Press Deploy in Coolify, or call the restart endpoint:
   ```bash
   curl -X POST -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
     "$COOLIFY_HOST/api/v1/services/$SERVICE_UUID/restart"
   ```
   **Do not rely on the deploy webhook for a release.** Against a stack that is
   already running, `GET $COOLIFY_DEPLOY_WEBHOOK_URL` answers
   `"Service Linkar started"` and then does nothing: no pull, no
   recreation, no new code. It only has an effect when the containers are
   absent, which is why it appears to work right after a Stop. The restart
   endpoint above performs a real down/up and honours `pull_policy: always`.

   Verify by asset, not by the deploy's own say-so - §5 of this file explains
   why the `release` field cannot be trusted:
   ```bash
   CSS=$(curl -sk https://app.linkar.in/login \
     | grep -oE '/_next/static/[a-z0-9/_-]+\.css' | head -1)
   curl -sk "https://app.linkar.in$CSS" | grep -c icon-rail   # 0 = old build
   ```
6. **Watch it settle.** The containers themselves cycle down and back up in
   roughly 60–90 seconds - a brief window where `valkey` also reads as exited
   is normal, not an outage. But `web` reporting `running:healthy` internally
   and the site actually being reachable from outside are two different
   things: in practice there's a further gap, observed anywhere from ~0s to
   ~2.5 minutes, before the reverse proxy routes real traffic to the new
   container. `pnpm deploy:coolify`'s external check (§4 step 2 above)
   retries against `/api/health` for up to ~3 minutes to cover this rather
   than failing on the first miss - if you're checking by hand instead of
   via the script, don't treat one failed `curl` right after the internal
   status flips healthy as a real failure; wait and retry before concluding
   something is actually wrong.
   ```bash
   curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" \
     "$COOLIFY_HOST/api/v1/services/$SERVICE_UUID" \
     | jq -r '((.applications//[])[] , (.databases//[])[]) | "\(.name): \(.status)"'
   ```
   Success looks like: `web: running:healthy`, `worker: running:unknown`,
   `migrate: exited`, `valkey` `running:healthy`.

   **`migrate`'s `DATABASE_URL` must be the direct connection (`DIRECT_URL`),
   not the pooler.** Using the transaction pooler for `migrate` causes
   `prisma migrate deploy` to hang indefinitely trying to acquire its
   advisory lock, which then blocks `web`/`worker` forever (they wait on
   `migrate: service_completed_successfully`) - this caused a real outage
   during the Supabase cutover. If `migrate` is stuck at
   `running:unknown:excluded` for more than a minute or two, this is the
   first thing to check.

`worker: running:unknown` is correct - the worker has no healthcheck because it
does not listen on a port. `migrate: exited` is correct for a completed
one-shot.

`web: running:healthy` is meaningful evidence: that healthcheck runs
`fetch('http://127.0.0.1:3000/api/health')` inside the container and fails
unless the response is `ok`.

Then verify from outside:

```bash
curl --fail --show-error https://app.linkar.in/api/health
```

Require `status: "ok"`, `mode: "configured"`, `dependencies.database: "ok"`
and `dependencies.redis: "ok"`. Also require
`capabilities.followGatedCampaigns: "enabled"`; if it is disabled, set
`FOLLOW_GATED_CAMPAIGNS_ENABLED=true` on both the web and worker services and
redeploy them together. Inspect worker logs for a clean Redis
connection, then exercise one controlled webhook event before re-enabling
customer automations.

**Ignore the `release` field.** It echoes the `SOURCE_COMMIT` environment
variable, which is set by hand in Coolify and is not updated by a deploy - as
of 2026-08-23 it still reports `2b43339`, many releases old. It will happily
confirm a release that never shipped. Until it is wired to the real commit,
verify with the asset check in step 4.

---

## 5. Recovering a failed migration (P3009)

Symptom: the site is down, `migrate` shows `exited`, and `web`/`worker` never
leave `created`/`starting`. Redeploying changes nothing.

**Step 1 - confirm the diagnosis.** Coolify 4.1.2 has no logs API for compose
services (`/api/v1/services/{uuid}/logs` returns 404), so use the UI logs, or
query Supabase directly - its SQL Editor (dashboard) or `psql <DIRECT_URL>`
both work from anywhere, since Supabase's Postgres (unlike the old in-stack
container) isn't restricted to the private compose network:

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM "_prisma_migrations"
WHERE finished_at IS NULL;
```

One row with an empty `finished_at` is a wedged migration. No rows at all means
`migrate` never ran the SQL - skip to step 3, it is a container-recreation
problem, not a database problem. (Also check that `migrate`'s `DATABASE_URL`
is actually `DIRECT_URL` - see the note in §4 step 6; a migration stuck
*running*, not failed, is usually that instead of a real P3009.)

**Step 2 - clear the failed row.** Back up first (`pg_dump` against
`DIRECT_URL`, or a Supabase point-in-time restore if enabled on the project's
plan).

```sql
DELETE FROM "_prisma_migrations"
WHERE migration_name = '<failed_migration_name>'
  AND finished_at IS NULL;
```

Run this via the Supabase SQL Editor or `psql <DIRECT_URL>`. Expect
`DELETE 1`. The `AND finished_at IS NULL` guard means it can only ever match a
failed attempt, never a successful migration.

Or, equivalently, from a one-off container (or any machine) with network
access to Supabase:

```bash
DATABASE_URL='<DIRECT_URL>' ./node_modules/.bin/prisma migrate resolve --rolled-back <failed_migration_name>
```

Both are safe because Postgres DDL is transactional: a failed migration rolls
back completely, leaving no partial tables. Confirm before assuming - if the
migration contains `CREATE INDEX CONCURRENTLY` or similar non-transactional
statements, inspect the schema by hand first.

**Step 3 - recreate the containers.** A plain Deploy leaves the exited one-shot
in place. Use Coolify's **force rebuild / force recreate** option on Deploy. If
the UI offers no such option, press **Stop**, wait for it to finish completely,
then press **Deploy** - never overlap the two.

**Step 4 - verify.**

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
- For `20260823180000_instagram_account_ownership`, run
  `pnpm preflight:instagram-ownership` against the production `DIRECT_URL`
  before recreating the service. Any reported account ID is a hard stop: back
  up the database and resolve ownership with the workspace owner; never merge,
  reassign, or delete duplicate rows automatically.
- `20260823200000_outbound_delivery_ledger` creates the shared outbound ledger
  and atomic daily quota counter used by classic flows, campaigns, sequences,
  broadcasts, lead email, and lead webhooks. Before deploying this release,
  capture a custom-format `pg_dump` against `DIRECT_URL`, verify the file is
  non-empty with mode `600`, and record its SHA-256 checksum somewhere outside
  the machine you ran the dump on. The migration is additive and does not
  replay historical sends.
- Test against a real PostgreSQL 17 before merging, applying the migration to a
  database already at the previous revision - not only to an empty one. A fresh
  database applies the whole history in order and hides ordering bugs.
- Back up Supabase Postgres (`pg_dump` against `DIRECT_URL`) before any release
  containing a migration.

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
| OAuth redirect URI | `https://app.linkar.in/api/meta/oauth/callback` |
| Webhooks callback URL | `https://app.linkar.in/api/meta/webhook` |
| Data deletion callback URL | `https://app.linkar.in/api/meta/data-deletion` |
| Facebook OAuth redirect URI | `https://app.linkar.in/api/facebook/oauth/callback` |
| Facebook webhooks callback URL | `https://app.linkar.in/api/facebook/webhook` |
| Facebook data deletion callback URL | `https://app.linkar.in/api/facebook/data-deletion` |
| Facebook deauthorization callback URL | `https://app.linkar.in/api/facebook/deauthorize` |
| Privacy policy | `https://linkar.in/privacy` |
| Terms of service | `https://linkar.in/terms` |
| Support URL | `https://linkar.in/support` |

Set `META_REDIRECT_URI` and `FACEBOOK_REDIRECT_URI` to their OAuth rows exactly.
Keep both verify tokens server-only and enter the matching value in each Meta
app when validating its webhook. See
[`docs/meta-app-review.md`](../docs/meta-app-review.md) for the reviewer test
script and App Review checklist.

---

## 7a. Configure Google and Facebook sign-in

Two separate mechanisms, not one - Google talks to Google directly; Facebook
still goes through Supabase's hosted OAuth relay. See
`src/lib/auth/google-oauth.ts` and `app/api/auth/oauth/facebook/route.ts` for
the code-level reasoning.

**Google.** Google's consent screen shows whichever domain owns the
`redirect_uri` in the authorize request. Supabase's hosted relay uses its own
project domain there, which is why this app bypasses it and talks to Google
directly - the tradeoff is one extra manual registration step:

- Google Cloud Console → APIs & Services → Credentials → the OAuth client used
  for `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` → **Authorized redirect URIs**
  must include `https://app.linkar.in/api/auth/oauth/google/callback` (our own
  callback, not Supabase's `.../auth/v1/callback` - that one is unused by this
  flow even though Supabase's Google provider must still be enabled below).
- Supabase Dashboard → Authentication → Sign In / Providers → Google →
  enabled, with the same Client ID/Secret. This is still required even though
  Supabase's own `/authorize` redirect isn't used: `signInWithIdToken()`
  validates the ID token's audience against this configuration.
- The OIDC `nonce` sent to Google must be a SHA-256 hash of the raw nonce
  passed to `signInWithIdToken()` (see `buildGoogleAuthorizeUrl` in
  `src/lib/auth/google-oauth.ts`) - Supabase hashes whatever raw nonce it's
  given and compares that hash to the ID token's `nonce` claim, so the claim
  has to already be a hash for the two to match. Getting this backwards
  produces `{"error":"Nonces mismatch"}` in the logs with no other symptom.

**Facebook.** Stays on Supabase's hosted relay (Facebook's classic web login
doesn't produce an OIDC ID token the way Google's does, so there's no
`signInWithIdToken` path available for it).

- Meta App → **Facebook Login for Business** → Settings → **Valid OAuth
  Redirect URIs** needs *both* URIs at once, for two different features on the
  same app:
  `https://<supabase-project-ref>.supabase.co/auth/v1/callback` (consumer
  sign-in, relayed through Supabase) and `https://app.linkar.in/api/facebook/oauth/callback`
  (the Page-automation connect flow in Settings, unrelated to sign-in).
- Supabase Dashboard → Authentication → Sign In / Providers → Facebook →
  enabled, with the Facebook App ID/Secret. There is no scopes field in this
  panel.
- **Supabase's Facebook provider defaults to requesting `scope=email` alone,
  which this app's Facebook Login for Business setup rejects outright** as an
  invalid scope combination (`Invalid Scopes: email` at Facebook's own
  authorize endpoint, confirmed by hand-building the request directly against
  `facebook.com/dialog/oauth` outside Supabase entirely - no App Review or
  Meta-side permission grant fixes it). The code works around this by passing
  `options: { scopes: "email public_profile" }` to `signInWithOAuth()` in
  `app/api/auth/oauth/facebook/route.ts` - if this route is ever rewritten,
  keep that option or the same error comes back.

**Testing either flow end-to-end** needs a real account and a human click -
curl can confirm the redirect chain reaches the right domain with the right
scopes, but completing the actual consent screen isn't something to automate.

---

## 8. Rolling back

Redeploy the last known-good image tag or digest from Coolify's deployment
history.

Do **not** roll back Supabase Postgres merely because an application deploy
failed, and do not run a reverse migration unless one has been prepared and
tested against the backup. A schema that has moved forward will usually still
serve the previous image, because migrations here are additive.

If the failure is a Supabase incident, check Supabase's own status page and
project logs first - this stack no longer manages that data service directly.
If it's Valkey, recover that private service and keep its volume. Either way,
repeat the health check and a controlled webhook delivery afterward. Rotate
secrets only for a compromise or a planned rotation.

---

## 9. Quick reference

| Symptom | Cause | Fix |
| --- | --- | --- |
| Site down, `migrate: exited`, redeploy does nothing | Failed migration → P3009 | §5 |
| No new row in `_prisma_migrations` after a deploy | One-shot never recreated (`restart: "no"`) | §5 step 3 |
| Whole stack exited for ~60–90s right after a push | Normal rollout | Wait |
| `/api/health` fails once right after `web` reports `running:healthy` internally | Reverse-proxy routing lag (up to ~2.5 min observed) | Retry - `pnpm deploy:coolify` already does this for you |
| `web` never leaves `created` | Dependency gate reading a stale failure | §5 step 3 |
| Container logs unavailable in the UI | Stop ran `docker compose down` | Deploy, then read logs |
| Deploy reports success but nothing changes | Webhook no-ops on a running stack | Use the restart endpoint (§4) |
| Redirects point at `localhost:3000` | `NEXT_PUBLIC_APP_URL` wrong at build time | Rebuild the image |
| `worker: running:unknown` | No healthcheck by design | Not a fault |
