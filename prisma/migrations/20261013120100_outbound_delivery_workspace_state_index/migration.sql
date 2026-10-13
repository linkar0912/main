-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- The delivery problems list (GET /api/automations/deliveries) reads FAILED
-- and UNKNOWN rows for one workspace, newest first. No existing index has
-- workspaceId with state, so it read every delivery the workspace ever made.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OutboundDelivery_workspaceId_state_updatedAt_idx"
ON "OutboundDelivery"("workspaceId", "state", "updatedAt");
