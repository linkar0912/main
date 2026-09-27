-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SequenceEnrollment_contactId_workspaceId_idx"
ON "SequenceEnrollment"("contactId", "workspaceId");
