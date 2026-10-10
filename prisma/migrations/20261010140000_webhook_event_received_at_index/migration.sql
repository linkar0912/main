-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- Retention deletes WebhookEvent rows by age across every workspace; without
-- this index each hourly sweep scanned the whole table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WebhookEvent_receivedAt_idx"
ON "WebhookEvent"("receivedAt");
