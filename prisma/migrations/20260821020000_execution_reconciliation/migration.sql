ALTER TABLE "AutomationExecution"
ADD COLUMN "dispatchStatus" TEXT NOT NULL DEFAULT 'CLAIMED',
ADD COLUMN "providerRecipientId" TEXT;
