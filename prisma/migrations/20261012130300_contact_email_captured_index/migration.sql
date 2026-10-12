-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationContact_emailCapturedBy_idx"
ON "AutomationContact"("workspaceId", "emailCapturedBy", "emailCapturedAt");
