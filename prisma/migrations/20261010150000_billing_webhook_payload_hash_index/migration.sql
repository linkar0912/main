-- The webhook replay guard looks up receipts by payloadHash inside a
-- Serializable transaction; without an index that is a sequential scan and a
-- relation-wide predicate lock. A plain (non-unique) index is used because
-- receipts written before the replay guard existed may share a hash, and a
-- unique index would fail to build on them. BillingWebhookEvent is a small,
-- append-only table, so a regular CREATE INDEX is brief.
CREATE INDEX IF NOT EXISTS "BillingWebhookEvent_payloadHash_idx" ON "BillingWebhookEvent"("payloadHash");
