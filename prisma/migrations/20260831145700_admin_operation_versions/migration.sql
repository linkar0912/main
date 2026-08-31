ALTER TABLE "TrackedLink" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "disabledAt" TIMESTAMP(3);
ALTER TABLE "Automation" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "AutomationContact" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AutomationSequence" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "Broadcast" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);
ALTER TABLE "OutboundDelivery" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "WebhookEvent" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "adminReprocessCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InstagramConnection" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "FacebookPageConnection" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "OutboundDelivery_updatedAt_id_idx" ON "OutboundDelivery"("updatedAt", "id");
CREATE INDEX "WebhookEvent_receivedAt_id_idx" ON "WebhookEvent"("receivedAt", "id");
