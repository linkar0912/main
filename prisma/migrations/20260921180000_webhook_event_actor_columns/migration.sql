-- See ops/DOKPLOY_DEPLOYMENT.md, "Migrations that add indexed columns". Existing rows are
-- backfilled afterwards by scripts/backfill-webhook-event-actors.mjs, in batches.
-- Adds nullable columns only: a catalog-only change with no table rewrite, so it is
-- safe to apply while the previous web release is still serving traffic.
ALTER TABLE "WebhookEvent"
ADD COLUMN IF NOT EXISTS "accountId" TEXT,
ADD COLUMN IF NOT EXISTS "recipientId" TEXT;
