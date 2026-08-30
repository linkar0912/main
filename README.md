# Linkar

Linkar is an India-first Instagram and Facebook Page automation MVP. It provides deterministic Instagram comment and inbound-DM replies plus public replies to top-level Facebook Page comments through Meta’s official APIs. There is no AI integration in this version.

## What is built

- Dashboard with demo mode and automation status controls.
- Guided builder for comment/DM keyword or any-message triggers.
- Optional keyword/media conditions.
- One private text reply (including optional URLs) for comment triggers; text, link, button, and image-card replies for genuine inbound DMs.
- Personalization tokens ({username}, {keyword}, {media}) in every outbound text.
- Timed follow-up nudges (up to two per DM flow) that respect opt-outs and Meta's 24-hour messaging window.
- Conversational lead forms: typed answers (email/phone/number validation), up to five questions, stop-word early exits.
- Smart keyword suggestions in the builder, drawn from the workspace's own automations plus proven staples.
- Win-back broadcast segments (quiet 7+ / 30+ days).
- Seven new India-first recipes: lead magnet, price-list responder, course FAQ, event registration, collab intake, giveaway entries, and offer follow-up.
- Current Instagram Business Login callback handling, webhook verification, inbound-only event normalization, BullMQ worker retries, and atomic execution claims.
- Facebook Page OAuth with an explicit Page picker, permission validation, read-only webhook health, loop prevention, reply-once enforcement, daily quotas, and public comment replies.
- A visual follow-gated Reel/post campaign builder: a matched comment triggers a public reply and a private opening message with an opt-in prompt, then Meta's own follower relationship gates a single private link delivery - with a participant activity view for diagnostics.
- AES-256-GCM encryption for stored Instagram and Facebook Page access tokens.
- Public privacy, terms, data deletion, and support pages for Meta App Review.
- Local demo mode when `DATABASE_URL` and `REDIS_URL` are omitted.

Out of scope: AI, unsolicited DMs sent purely because someone followed the account, scraping, bulk cold messaging, WhatsApp, publishing, billing.

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

Production requires a Supabase project (Postgres + Auth), Valkey, Meta
credentials, and a public HTTPS URL. Build the release, apply only committed
migrations, then run the web and worker as separate long-lived processes:

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

Accounts are self-serve: anyone can create a workspace at `/signup` (email +
password), then connect an Instagram account or Facebook Page through the settings page.
Auth is handled by Supabase Auth (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); email
confirmation and password-reset links route through `/auth/confirm`.
`AUTH_SESSION_SECRET` is still required for the rate-limit key HMAC - generate
it with a password manager or:

```bash
openssl rand -hex 32
```

Linkar claims each automation event before calling Meta. A successful or terminally failed delivery is persisted; a retryable failure releases the claim for BullMQ retry. If a worker loses power after Meta accepts a message but before the result is persisted, the claim remains `PROCESSING` so the system favors preventing a duplicate reply over blindly resending an ambiguous delivery.

## Verification

```bash
pnpm test
pnpm lint
pnpm build
pnpm test:e2e
```

## Production requirements

Production needs a public HTTPS deployment, a Supabase project (Postgres + Auth), Valkey, a stable `NEXT_PUBLIC_APP_URL`, an `AUTH_SESSION_SECRET`, a Meta App ID and secret, a token encryption key, and the worker process running alongside the web process. `GET /api/health` reports dependency state without returning connection details; it returns `503` when either configured dependency is unavailable or only one of Postgres and Valkey is configured. Coolify can set `SOURCE_COMMIT` to include its deployment commit marker. Accounts are self-serve via `/signup`; each account gets its own isolated workspace.

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
curl --fail --show-error https://linkar.in/api/health
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
