-- Automation priority field for the "which flow wins" tie-breaker. 0 is the default
-- and works for every workspace running a single flow per event.

ALTER TABLE "Automation" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Automation_workspaceId_priority_idx" ON "Automation" ("workspaceId", "priority");
