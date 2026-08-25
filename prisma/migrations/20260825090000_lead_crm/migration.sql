-- Lead CRM: pipeline status, assignee, internal notes, and source attribution.
-- The new columns are nullable or have safe defaults so existing rows stay valid.

CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'ENGAGED', 'QUALIFIED', 'CUSTOMER');

ALTER TABLE "AutomationContact"
  ADD COLUMN "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "assigneeUserId" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "sourceAutomationId" TEXT;

CREATE INDEX "AutomationContact_leadStatus_idx" ON "AutomationContact" ("workspaceId", "leadStatus");
CREATE INDEX "AutomationContact_assigneeUserId_idx" ON "AutomationContact" ("workspaceId", "assigneeUserId");
