ALTER TABLE "AutomationExecution"
ADD COLUMN "dispatchStatus" TEXT,
ADD COLUMN "dispatchOwner" TEXT,
ADD COLUMN "dispatchStartedAt" TIMESTAMP(3),
ADD COLUMN "dispatchLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "providerRecipientId" TEXT;

UPDATE "AutomationExecution"
SET
  "dispatchStatus" = 'DISPATCHING',
  "status" = 'FAILED',
  "reason" = COALESCE(
    "reason",
    'Historical processing execution migrated fail-closed because provider outcome is ambiguous'
  )
WHERE "status" = 'PROCESSING';

UPDATE "AutomationExecution"
SET "dispatchStatus" = 'CLAIMED'
WHERE "dispatchStatus" IS NULL;

ALTER TABLE "AutomationExecution"
ALTER COLUMN "dispatchStatus" SET DEFAULT 'CLAIMED',
ALTER COLUMN "dispatchStatus" SET NOT NULL;

CREATE UNIQUE INDEX "AutomationExecution_dispatchOwner_key"
ON "AutomationExecution"("dispatchOwner");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "AutomationExecution"
    WHERE "status" = 'PROCESSING'
  ) THEN
    RAISE EXCEPTION 'Historical PROCESSING executions must be terminally failed during reconciliation migration';
  END IF;
END $$;
