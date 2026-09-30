-- Replies sent from the Linkar inbox record an OutboundDelivery of kind
-- MANUAL_INBOX, which the kind check never allowed: every inbox reply was
-- rejected by the database before reaching Meta. NOT VALID + VALIDATE keeps the
-- ACCESS EXCLUSIVE lock to the constraint swap; the scan runs under a weaker lock.
ALTER TABLE "OutboundDelivery" DROP CONSTRAINT "OutboundDelivery_kind_check";
ALTER TABLE "OutboundDelivery" ADD CONSTRAINT "OutboundDelivery_kind_check" CHECK ("kind" IN ('CLASSIC_ACTION', 'EMAIL_CAPTURE', 'CAMPAIGN_ACTION', 'SEQUENCE_STEP', 'BROADCAST_RECIPIENT', 'LEAD_EMAIL', 'LEAD_WEBHOOK', 'FLOW_FOLLOWUP', 'MANUAL_INBOX')) NOT VALID;
ALTER TABLE "OutboundDelivery" VALIDATE CONSTRAINT "OutboundDelivery_kind_check";
