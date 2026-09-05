CREATE TYPE "AdminIncidentSeverity" AS ENUM ('WARNING', 'CRITICAL');
CREATE TYPE "AdminIncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "AdminIncident" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "activeKey" TEXT,
  "source" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "severity" "AdminIncidentSeverity" NOT NULL,
  "status" "AdminIncidentStatus" NOT NULL DEFAULT 'OPEN',
  "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "notificationSentAt" TIMESTAMP(3),
  "recoverySentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminIncident_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminIncident_occurrence_count" CHECK ("occurrenceCount" > 0),
  CONSTRAINT "AdminIncident_resolution_state" CHECK (
    ("status" = 'RESOLVED' AND "resolvedAt" IS NOT NULL AND "activeKey" IS NULL)
    OR ("status" <> 'RESOLVED' AND "resolvedAt" IS NULL AND "activeKey" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "AdminIncident_activeKey_key" ON "AdminIncident"("activeKey");
CREATE INDEX "AdminIncident_status_severity_lastSeenAt_idx" ON "AdminIncident"("status", "severity", "lastSeenAt");
CREATE INDEX "AdminIncident_fingerprint_createdAt_idx" ON "AdminIncident"("fingerprint", "createdAt");
CREATE INDEX "AdminIncident_resolvedAt_idx" ON "AdminIncident"("resolvedAt");

ALTER TABLE "AdminIncident" ENABLE ROW LEVEL SECURITY;
