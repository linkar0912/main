-- The worker's execution reconciliation sweep looks for PROCESSING executions
-- across every workspace. Only a handful of rows are ever PROCESSING, so a
-- partial index keeps that lookup tiny on a table that grows with every
-- reply. Partial indexes cannot be declared in schema.prisma.
-- Built CONCURRENTLY so it never blocks live writes. This must stay the ONLY
-- statement in this file: CREATE/DROP INDEX CONCURRENTLY cannot run inside a
-- transaction block, and a multi-statement migration is sent as one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AutomationExecution_processing_createdAt_idx"
ON "AutomationExecution"("createdAt") WHERE "status" = 'PROCESSING';
