-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- The hourly expiry sweep selects open participants (by state) whose
-- messaging window has passed or was never set.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationParticipant_state_messagingWindowExpiresAt_idx"
ON "AutomationParticipant"("state", "messagingWindowExpiresAt");
