ALTER TABLE "Automation" ADD COLUMN "activatedAt" TIMESTAMP(3), ADD COLUMN "boundMediaId" TEXT;

CREATE TYPE "ParticipantState" AS ENUM ('COMMENT_MATCHED', 'OPENING_SENT', 'OPTED_IN', 'FOLLOW_REQUIRED', 'FOLLOW_VERIFIED', 'LINK_SENT', 'EXPIRED', 'FAILED');

CREATE TABLE "AutomationParticipant" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "igScopedUserId" TEXT,
    "sourceCommentId" TEXT NOT NULL,
    "sourceMediaId" TEXT NOT NULL,
    "sourceMediaSnapshot" JSONB NOT NULL,
    "matchedKeyword" TEXT,
    "state" "ParticipantState" NOT NULL DEFAULT 'COMMENT_MATCHED',
    "publicReplyStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "publicReplyProviderId" TEXT,
    "publicReplySentAt" TIMESTAMP(3),
    "publicReplyError" TEXT,
    "openingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "openingProviderId" TEXT,
    "openingSentAt" TIMESTAMP(3),
    "openingError" TEXT,
    "followStatus" BOOLEAN,
    "followCheckedAt" TIMESTAMP(3),
    "followCheckError" TEXT,
    "finalDeliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "finalProviderId" TEXT,
    "finalDeliveredAt" TIMESTAMP(3),
    "finalDeliveryError" TEXT,
    "messagingWindowExpiresAt" TIMESTAMP(3),
    "recheckCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutomationParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationParticipant_workspaceId_instagramAccountId_sourceCommentId_key" ON "AutomationParticipant"("workspaceId", "instagramAccountId", "sourceCommentId");
CREATE INDEX "AutomationParticipant_instagramAccountId_igScopedUserId_state_idx" ON "AutomationParticipant"("instagramAccountId", "igScopedUserId", "state");
CREATE INDEX "AutomationParticipant_workspaceId_automationId_updatedAt_idx" ON "AutomationParticipant"("workspaceId", "automationId", "updatedAt");

ALTER TABLE "AutomationParticipant" ADD CONSTRAINT "AutomationParticipant_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationParticipant" ADD CONSTRAINT "AutomationParticipant_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
