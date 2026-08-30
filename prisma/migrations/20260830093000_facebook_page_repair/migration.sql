ALTER TABLE "FacebookPageConnection" ADD COLUMN "facebookUserId" TEXT;

CREATE INDEX "FacebookPageConnection_facebookUserId_idx"
ON "FacebookPageConnection"("facebookUserId");

CREATE TABLE "FacebookReplyRecipient" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "claimEventId" TEXT NOT NULL,
  "claimExpiresAt" TIMESTAMP(3) NOT NULL,
  "repliedAt" TIMESTAMP(3),
  CONSTRAINT "FacebookReplyRecipient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookReplyRecipient_automationId_pageId_senderId_key"
ON "FacebookReplyRecipient"("automationId", "pageId", "senderId");

CREATE INDEX "FacebookReplyRecipient_claimExpiresAt_idx"
ON "FacebookReplyRecipient"("claimExpiresAt");

ALTER TABLE "FacebookReplyRecipient"
ADD CONSTRAINT "FacebookReplyRecipient_automationId_fkey"
FOREIGN KEY ("automationId") REFERENCES "Automation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
