-- Lets a manual-reply echo be matched to the automated send it came from.
-- Built CONCURRENTLY so it never blocks delivery writes. This must stay the
-- ONLY statement in this file: CREATE INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OutboundDelivery_providerMessageId_idx"
ON "OutboundDelivery"("providerMessageId");
