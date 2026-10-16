-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- Meta's data-deletion callback deletes one Instagram account's deliveries
-- across every workspace (beginInstagramDataDeletion). Every index on
-- OutboundDelivery that has instagramAccountId starts with workspaceId, so
-- that delete read the whole table inside the callback's transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "OutboundDelivery_instagramAccountId_idx"
ON "OutboundDelivery"("instagramAccountId");
