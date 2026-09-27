-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
-- Superseded by SequenceEnrollment_contactId_workspaceId_idx, which also covers
-- the (contactId, workspaceId) foreign key.
DROP INDEX CONCURRENTLY IF EXISTS "SequenceEnrollment_contactId_idx";
