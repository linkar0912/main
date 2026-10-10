-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- The retention sweep deletes terminal participants (by state) last updated
-- before the 90-day cutoff.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationParticipant_state_updatedAt_idx"
ON "AutomationParticipant"("state", "updatedAt");
