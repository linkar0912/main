-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- Contacts stage tabs list one lead status ordered by "lastSeenAt" DESC, "id"
-- ASC with a (lastSeenAt, id) cursor. The (workspaceId, leadStatus) index can
-- only find the rows and then sort them all; this one returns them in order.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationContact_leadStatus_lastSeenAt_idx"
ON "AutomationContact"("workspaceId", "leadStatus", "lastSeenAt" DESC, "id");
