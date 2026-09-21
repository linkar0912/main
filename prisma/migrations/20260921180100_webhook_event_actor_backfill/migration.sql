-- Step 2 of 3. Backfill from the JSON payload written by the webhook runners
-- (payload.accountId / payload.recipientId on Instagram events; Facebook comment
-- events have neither and stay NULL, which the inbox never queries).
--
-- Idempotent: only touches rows that still need a value, so it is also the
-- catch-up pass for events the previous release wrote between step 1 and the
-- new release going live. Re-run it after the deploy (see the runbook).
UPDATE "WebhookEvent"
SET "accountId" = COALESCE("accountId", payload->>'accountId'),
    "recipientId" = COALESCE("recipientId", payload->>'recipientId')
WHERE ("accountId" IS NULL AND payload ? 'accountId')
   OR ("recipientId" IS NULL AND payload ? 'recipientId');
