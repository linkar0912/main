-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- Retention clears lastInboundAt older than the cutoff across every workspace;
-- the existing index leads with workspaceId and cannot serve that sweep.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationContact_lastInboundAt_idx"
ON "AutomationContact"("lastInboundAt");
