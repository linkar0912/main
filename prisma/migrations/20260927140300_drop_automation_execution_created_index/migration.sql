-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- Superseded by AutomationExecution_workspaceId_createdAt_status_idx, which has
-- the same leading columns.
DROP INDEX CONCURRENTLY IF EXISTS "AutomationExecution_workspaceId_createdAt_idx";
