# ReplyConnect

ReplyConnect is an India-first Instagram automation MVP for deterministic comment and inbound-DM replies. It uses a guided Trigger → Condition → Action builder and Meta’s official Instagram APIs. There is no AI integration in this version.

## What is built

- Dashboard with demo mode and automation status controls.
- Guided builder for comment/DM keyword or any-message triggers.
- Optional keyword/media conditions.
- Private comment replies, text DMs, link messages, and button messages.
- Meta OAuth callback, webhook verification, event normalization, BullMQ worker, retries, and execution deduplication.
- AES-256-GCM encryption for stored Instagram access tokens.
- Public privacy, terms, data deletion, and support pages for Meta App Review.
- Local demo mode when `DATABASE_URL` and `REDIS_URL` are omitted.

Out of scope: AI, follower-triggered DMs, scraping, bulk cold messaging, WhatsApp, publishing, insights, billing, and team invitations.

## Local demo (no database or worker)

```bash
pnpm install
pnpm db:generate
pnpm dev
```

Run this without `DATABASE_URL` or `REDIS_URL`; the dashboard uses sample data
and no worker is required. This is a local demonstration mode only and must
never be used for a public deployment.

## Persistent local stack

To exercise PostgreSQL, Valkey, migrations, and the worker on your machine:

```bash
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm dev
pnpm worker
```

`pnpm db:migrate` is Prisma's development migration command and is only for
this local workflow.

## Production deployment

Production requires configured PostgreSQL, Valkey, Meta credentials, and a
public HTTPS URL. Build the release, apply only committed migrations, then run
the web and worker as separate long-lived processes:

```bash
pnpm build
pnpm db:migrate:deploy
pnpm start
pnpm worker
```

Do not use `pnpm db:migrate` or `pnpm db:seed` in production. The complete
Coolify/Cloudflare release order, rollback procedure, and owner-supplied values
are in [`ops/COOLIFY_DEPLOYMENT.md`](ops/COOLIFY_DEPLOYMENT.md).

Generate a token encryption key with:

```bash
openssl rand -hex 32
```

Put the result in `META_TOKEN_ENCRYPTION_KEY`. Never commit `.env` or any Meta secret.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

## Production requirements

Production needs a public HTTPS deployment, PostgreSQL, Valkey, a stable `NEXT_PUBLIC_APP_URL`, a Meta App ID and secret, a token encryption key, and the worker process running alongside the web process. `GET /api/health` reports dependency state without returning connection details; it returns `503` when either configured dependency is unavailable or only one of PostgreSQL and Valkey is configured. Coolify can set `SOURCE_COMMIT` to include its deployment commit marker. This repository intentionally keeps workspace identity simple for the MVP; add real authentication and workspace membership before opening it to multiple customers.

The local production topology can be checked with:

```bash
cp .env.production.example .env.production
pnpm check:compose
```

`.env.production` contains secrets and is intentionally ignored; replace every
placeholder before any deployment. `check:compose` reads the checked-in example
template so it can validate strict required-variable interpolation without a
local secret file. Do not publish PostgreSQL or Valkey ports.

After the web service is public, verify its configured dependencies without
printing connection details:

```bash
curl --fail --show-error https://<replyconnect-domain>/api/health
```

## Meta App Review

Follow [`docs/meta-app-review.md`](docs/meta-app-review.md) for the Meta dashboard configuration, environment values, reviewer test script, and submission checklist. The public review surfaces are:

- `/privacy`
- `/terms`
- `/data-deletion`
- `/support`
- `/api/meta/data-deletion`
- `/api/meta/oauth/callback`
- `/api/meta/webhook`

Actual App Review submission still requires the founder’s Meta developer account, real App ID/secret, public deployment, business/test accounts, and any Meta-requested verification or advanced access.
