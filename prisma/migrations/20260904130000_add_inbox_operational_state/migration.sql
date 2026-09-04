ALTER TABLE "AutomationContact"
ADD COLUMN "inboxStatus" TEXT NOT NULL DEFAULT 'OPEN',
ADD COLUMN "inboxFavorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "inboxReminderAt" TIMESTAMP(3),
ADD COLUMN "inboxLastReadAt" TIMESTAMP(3);

CREATE INDEX "AutomationContact_workspaceId_inboxStatus_lastSeenAt_id_idx"
ON "AutomationContact"("workspaceId", "inboxStatus", "lastSeenAt", "id");

CREATE INDEX "AutomationContact_workspaceId_inboxReminderAt_id_idx"
ON "AutomationContact"("workspaceId", "inboxReminderAt", "id");

CREATE INDEX "AutomationContact_workspaceId_lastSeenAt_id_idx"
ON "AutomationContact"("workspaceId", "lastSeenAt", "id");
