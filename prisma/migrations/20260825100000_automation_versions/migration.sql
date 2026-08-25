-- Append-only history of automation definitions. Snapshots are produced by
-- the PATCH route and by the duplicate + restore flows.

CREATE TABLE "AutomationVersion" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "snapshotBy" TEXT,
  "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AutomationVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationVersion_automationId_version_key" ON "AutomationVersion" ("automationId", "version");
CREATE INDEX "AutomationVersion_automationId_snapshotAt_idx" ON "AutomationVersion" ("automationId", "snapshotAt");
