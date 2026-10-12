-- Makes captured emails countable per automation (the automation Overview's
-- "Emails collected" and its "Messaged -> Asked for email -> Gave email"
-- funnel). Until now only the workspace-wide total existed: the contact kept
-- awaitingAutomationId while it waited and cleared it once the email came in.
--
-- emailRequestedAt / emailRequestedBy: the automation (id) that last asked
-- this person for an email. emailCapturedAt / emailCapturedBy: the automation
-- that captured it. Set by setContactAwaitingEmail and captureContactEmail.
--
-- Nullable columns only (catalog-only, no table rewrite). The indexes are
-- built CONCURRENTLY by the next two migrations.
ALTER TABLE "AutomationContact"
ADD COLUMN IF NOT EXISTS "emailRequestedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "emailRequestedBy" TEXT,
ADD COLUMN IF NOT EXISTS "emailCapturedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "emailCapturedBy" TEXT;

-- Backfill (best effort) from what the database still knows.
-- 1. People waiting to answer, or mid conversational form, were asked by
--    awaitingAutomationId at awaitingSince.
UPDATE "AutomationContact"
SET "emailRequestedAt" = "awaitingSince",
    "emailRequestedBy" = "awaitingAutomationId"
WHERE "emailRequestedAt" IS NULL
  AND "state" IN ('AWAITING_EMAIL', 'AWAITING_FIELD')
  AND "awaitingAutomationId" IS NOT NULL
  AND "awaitingSince" IS NOT NULL;

-- 2. Mid conversational form: that automation captured the email when the
--    questions began.
UPDATE "AutomationContact"
SET "emailCapturedAt" = "awaitingSince",
    "emailCapturedBy" = "awaitingAutomationId"
WHERE "emailCapturedAt" IS NULL
  AND "state" = 'AWAITING_FIELD'
  AND "email" IS NOT NULL
  AND "awaitingAutomationId" IS NOT NULL
  AND "awaitingSince" IS NOT NULL;

-- 3. Finished captures whose automation fulfils leads: a lead email or lead
--    webhook is queued at capture time, addressed to the email, so the first
--    one names the automation and the moment. Captures without a fulfilment
--    step left no trace and stay unattributed.
UPDATE "AutomationContact" c
SET "emailCapturedAt" = l."capturedAt",
    "emailCapturedBy" = l."automationId",
    "emailRequestedAt" = COALESCE(c."emailRequestedAt", l."capturedAt"),
    "emailRequestedBy" = COALESCE(c."emailRequestedBy", l."automationId")
FROM (
  SELECT DISTINCT ON ("workspaceId", LOWER("recipientId"))
    "workspaceId", LOWER("recipientId") AS "email", "automationId", "createdAt" AS "capturedAt"
  FROM "OutboundDelivery"
  WHERE "kind" IN ('LEAD_EMAIL', 'LEAD_WEBHOOK')
    AND "automationId" IS NOT NULL
    AND "recipientId" IS NOT NULL
  ORDER BY "workspaceId", LOWER("recipientId"), "createdAt" ASC
) l
WHERE c."workspaceId" = l."workspaceId"
  AND c."email" = l."email"
  AND c."emailCapturedAt" IS NULL;
