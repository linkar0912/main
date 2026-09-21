-- Step 3 of 3. Built CONCURRENTLY so it never blocks webhook inserts. This must
-- stay the ONLY statement in this file: CREATE INDEX CONCURRENTLY cannot run
-- inside a transaction block, and a multi-statement migration is sent as one.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "WebhookEvent_workspaceId_accountId_recipientId_receivedAt_idx"
ON "WebhookEvent"("workspaceId", "accountId", "recipientId", "receivedAt");
