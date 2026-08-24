-- Flow follow-ups reuse the outbound delivery ledger with a new kind, so the
-- CHECK constraint must learn "FLOW_FOLLOWUP" before any scheduled nudge lands.
ALTER TABLE "OutboundDelivery" DROP CONSTRAINT "OutboundDelivery_kind_check";
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_kind_check" CHECK ("kind" IN ('CLASSIC_ACTION', 'EMAIL_CAPTURE', 'CAMPAIGN_ACTION', 'SEQUENCE_STEP', 'BROADCAST_RECIPIENT', 'LEAD_EMAIL', 'LEAD_WEBHOOK', 'FLOW_FOLLOWUP'));
