-- Allow a workspace to connect several Instagram professional accounts.
DROP INDEX IF EXISTS "InstagramConnection_workspaceId_key";

-- Click tracking for delivered links.
ALTER TABLE "AutomationParticipant" ADD COLUMN "deliveryClickedAt" TIMESTAMP(3);
