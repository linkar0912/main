# ReplyConnect production deployment: Coolify behind Cloudflare

This runbook packages ReplyConnect as two long-running Coolify applications
from the same repository and commit:

```text
Cloudflare (public HTTPS) -> Coolify web -> Next.js dashboard and API
                                         -> private PostgreSQL
                                         -> private Valkey
                       -> Coolify worker -> BullMQ -> Meta Graph API
```

The owner must provide the real ReplyConnect domain, Cloudflare zone access,
Coolify project/server access, Meta credentials, and high-entropy database,
Valkey, webhook, and encryption secrets. This repository does not deploy or
contain any of those values.

## 1. Provision private data services

Create a dedicated ReplyConnect PostgreSQL 17 service and a dedicated Valkey
service in the ReplyConnect Coolify project. Do not reuse TrackParcel's data,
services, networks, volumes, aliases, or credentials.

Create one ReplyConnect-only private Coolify network, for example
`replyconnect-private`, and attach exactly these production services to it:
`replyconnect-web`, `replyconnect-worker`, `replyconnect-postgres`, and
`replyconnect-valkey`. Configure the stable ReplyConnect-only private aliases
`replyconnect-postgres` and `replyconnect-valkey` for the data services. Never
use a TrackParcel alias or attach a ReplyConnect service to a TrackParcel
network. PostgreSQL and Valkey must have neither public ports nor FQDNs.

- Create the PostgreSQL database, user, and password from owner-provided
  values. Do not expose port 5432 or assign an FQDN.
- Create Valkey from the contract in [`valkey/README.md`](valkey/README.md).
  Use a distinct `VALKEY_PASSWORD`; do not expose port 6379 or assign an FQDN.
- The local compose fixture uses `postgres` and `valkey`. In Coolify, use only
  the stable private aliases `replyconnect-postgres` and `replyconnect-valkey`.
- Put the URLs in both application secret sets using those aliases:
  `DATABASE_URL=postgresql://<user>:<password>@replyconnect-postgres:5432/<database>?schema=public`
  and `REDIS_URL=redis://:<valkey-password>@replyconnect-valkey:6379/0`.

Wait for both data-service health checks before applying migrations or starting
the application processes.

## 2. Create the two applications

Create two Coolify applications that point to the same repository, branch, and
commit, and select the repository `Dockerfile` as the build method.

| Application | Start command | Public routing |
| --- | --- | --- |
| `replyconnect-web` | `pnpm start` | Assign the ReplyConnect domain and container port `3000`. |
| `replyconnect-worker` | `pnpm worker` | No domain and no published port. |

Give both applications the same server-side variables: `APP_NAME`,
`NEXT_PUBLIC_APP_URL`, `SUPPORT_EMAIL`, `DATABASE_URL`, `REDIS_URL`,
`META_APP_ID`, `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY`,
`META_REDIRECT_URI`, `META_VERIFY_TOKEN`, `META_API_VERSION`,
`META_SCOPES`, and `SOURCE_COMMIT`. Keep secrets in Coolify, never in a Git
variable or `NEXT_PUBLIC_*` variable.

Use [`.env.production.example`](../.env.production.example) as a names-only
template. Replace its placeholders with owner-provided values. Generate
`META_TOKEN_ENCRYPTION_KEY` with `openssl rand -hex 32`; it is a 64-character
hex value and must remain stable after Instagram tokens have been stored.

The image defaults to `pnpm start`; the worker application's command override
is `pnpm worker`. The runtime image also contains `pnpm db:migrate:deploy` for
the explicit migration step below. Both applications must also attach to
`replyconnect-private`; only `replyconnect-web` receives the public domain.
The shared image intentionally has no Dockerfile `HEALTHCHECK`: configure the
HTTP `/api/health` check only for `replyconnect-web`, because the worker shares
the image but does not listen on port 3000.

## 3. Route the web app through Cloudflare

Set `NEXT_PUBLIC_APP_URL` to `https://<replyconnect-domain>` and use matching
HTTPS URLs throughout Meta and Coolify. In Cloudflare, create the DNS record
for the Coolify web application and keep proxying enabled. Use Full (strict)
TLS with a valid origin certificate.

Lock the Coolify origin to Cloudflare. Preferred: route through a Cloudflare
Tunnel and close public inbound TCP 80/443 on the server firewall. Alternative:
allow inbound TCP 80/443 only from Cloudflare's current published IP ranges and
deny all other sources. Keep SSH limited to the owner's management network.

Do not route Cloudflare, a public hostname, or any port to the worker,
PostgreSQL, or Valkey.

## 4. Apply migrations and deploy

For every release, use this order:

1. Confirm both private data services are healthy and back up PostgreSQL before
   any migration.
2. Choose the image delivery path before deploying:
   - **Normal Dockerfile path:** Coolify builds `replyconnect-worker` and
     `replyconnect-web` independently from the same immutable commit SHA. Deploy
     them sequentially and budget for two builds on the host; on a single-vCPU
     server, wait for the first build to finish before starting the second.
   - **Recommended one-build path:** CI or a dedicated build server builds the
     Dockerfile once, pushes a private-registry image, and records its immutable
     digest. Configure both Coolify applications to deploy that exact digest;
     their commands remain `pnpm worker` and `pnpm start` respectively.
3. Run this one-off command from the release image in Coolify before promoting
   either application: `pnpm db:migrate:deploy`.
4. Start or redeploy `replyconnect-worker` with `pnpm worker`.
5. Start or redeploy `replyconnect-web` with `pnpm start`; only this service
   listens on container port 3000 and receives a public domain.

Application startup never runs migrations automatically. Do not use
`pnpm db:migrate` in production because it is Prisma's development command.

## 5. Verify the release

After the web domain is live, call:

```bash
curl --fail --show-error https://<replyconnect-domain>/api/health
```

Require `status: "ok"`, `mode: "configured"`,
`dependencies.database: "ok"`, `dependencies.redis: "ok"`, and the expected
`SOURCE_COMMIT` release marker. Then confirm the web and worker services are
running, inspect worker logs for a clean Redis connection, and exercise one
controlled webhook event before enabling customer automations.

## 6. Configure Meta after the public health check

Use the final public domain, not a Coolify internal URL:

| Meta setting | Owner-provided production value |
| --- | --- |
| OAuth redirect URI | `https://<replyconnect-domain>/api/meta/oauth/callback` |
| Webhooks callback URL | `https://<replyconnect-domain>/api/meta/webhook` |
| Data deletion callback URL | `https://<replyconnect-domain>/api/meta/data-deletion` |
| Privacy policy | `https://<replyconnect-domain>/privacy` |
| Terms of service | `https://<replyconnect-domain>/terms` |
| Support URL | `https://<replyconnect-domain>/support` |

Set `META_REDIRECT_URI` to the OAuth row exactly. Keep `META_VERIFY_TOKEN`
server-only and enter the same value in Meta when validating the webhook. See
[`docs/meta-app-review.md`](../docs/meta-app-review.md) for the Meta reviewer
test script and App Review checklist.

## 7. Roll back safely

If web or worker verification fails after a release, stop external testing and
redeploy the last known-good web and worker releases from Coolify's deployment
history. Do not roll back PostgreSQL merely because an application deploy
failed, and do not run a reverse migration unless it has been prepared and
tested against the backup. If the failure is a data-service incident, recover
that private service first and retain its volume; then repeat the health check
and controlled webhook delivery. Rotate secrets only when compromise or a
planned rotation requires it.
