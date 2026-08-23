CREATE TABLE "OutboundDelivery" (
    "id" TEXT NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipientId" TEXT,
    "instagramAccountId" TEXT,
    "automationId" TEXT,
    "participantId" TEXT,
    "sequenceEnrollmentId" TEXT,
    "broadcastId" TEXT,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "retryable" BOOLEAN NOT NULL DEFAULT false,
    "resultCode" TEXT,
    "claimOwner" TEXT,
    "claimExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "OutboundDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OutboundDelivery_state_check" CHECK ("state" IN ('PENDING', 'CLAIMED', 'SENT', 'FAILED', 'UNKNOWN')),
    CONSTRAINT "OutboundDelivery_kind_check" CHECK ("kind" IN ('CLASSIC_ACTION', 'EMAIL_CAPTURE', 'CAMPAIGN_ACTION', 'SEQUENCE_STEP', 'BROADCAST_RECIPIENT', 'LEAD_EMAIL', 'LEAD_WEBHOOK')),
    CONSTRAINT "OutboundDelivery_resultCode_check" CHECK ("resultCode" IS NULL OR "resultCode" IN ('DELIVERED', 'PROVIDER_REJECTED', 'RETRYABLE_REJECTION', 'SUPPRESSED', 'WINDOW_CLOSED', 'AMBIGUOUS')),
    CONSTRAINT "OutboundDelivery_attemptCount_check" CHECK ("attemptCount" >= 0)
);

CREATE TABLE "AutomationDailySendCounter" (
    "automationId" TEXT NOT NULL,
    "utcDate" DATE NOT NULL,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationDailySendCounter_reserved_check" CHECK ("reserved" >= 0),
    CONSTRAINT "AutomationDailySendCounter_pkey" PRIMARY KEY ("automationId", "utcDate")
);

CREATE UNIQUE INDEX "OutboundDelivery_deliveryKey_key" ON "OutboundDelivery"("deliveryKey");
CREATE INDEX "OutboundDelivery_state_claimExpiresAt_idx" ON "OutboundDelivery"("state", "claimExpiresAt");
CREATE INDEX "OutboundDelivery_workspaceId_kind_createdAt_idx" ON "OutboundDelivery"("workspaceId", "kind", "createdAt");
CREATE INDEX "OutboundDelivery_broadcastId_state_idx" ON "OutboundDelivery"("broadcastId", "state");

ALTER TABLE "OutboundDelivery"
ADD CONSTRAINT "OutboundDelivery_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationDailySendCounter"
ADD CONSTRAINT "AutomationDailySendCounter_automationId_fkey"
FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
