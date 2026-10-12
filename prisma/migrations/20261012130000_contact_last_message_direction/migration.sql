-- Who spoke last in each conversation, so the inbox keeps a read but
-- unanswered conversation in "Waiting on you" across reloads.
--
-- lastInboundAt is already kept by the WebhookEvent trigger (migration
-- 20260927140000_contact_last_inbound). This adds lastOutboundAt, kept by a
-- trigger on OutboundDelivery when a delivery reaches SENT (manual inbox
-- replies, automation replies, sequences and broadcasts all go through that
-- ledger), and lastMessageDirection, which both triggers set from the later of
-- the two. Lead emails and lead webhooks are not messages to the person and
-- are left out. Comments are not inbox messages (the inbox lists DMs only),
-- so they do not change the direction either.
--
-- Nullable columns only (catalog-only, no table rewrite).
ALTER TABLE "AutomationContact"
ADD COLUMN IF NOT EXISTS "lastOutboundAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastMessageDirection" TEXT;

-- NOT VALID: checks new writes without scanning the existing rows.
ALTER TABLE "AutomationContact" DROP CONSTRAINT IF EXISTS "AutomationContact_lastMessageDirection_check";
ALTER TABLE "AutomationContact"
ADD CONSTRAINT "AutomationContact_lastMessageDirection_check"
CHECK ("lastMessageDirection" IS NULL OR "lastMessageDirection" IN ('INBOUND', 'OUTBOUND')) NOT VALID;

-- Same body as before, plus the direction. Events arrive out of order across
-- workers, so an older event never overwrites a newer one, and a reply sent
-- after this message keeps the conversation answered.
CREATE OR REPLACE FUNCTION public.linkar_contact_inbound_from_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public."AutomationContact"
  SET "lastInboundAt" = NEW."receivedAt",
      "lastInboundPreview" = public.linkar_inbound_preview(NEW."payload", NEW."eventType"),
      "lastMessageDirection" = CASE
        WHEN "lastOutboundAt" IS NOT NULL AND "lastOutboundAt" > NEW."receivedAt" THEN 'OUTBOUND'
        ELSE 'INBOUND'
      END
  WHERE "workspaceId" = NEW."workspaceId"
    AND "instagramAccountId" = NEW."accountId"
    AND "igScopedUserId" = NEW."recipientId"
    AND ("lastInboundAt" IS NULL OR "lastInboundAt" <= NEW."receivedAt");
  RETURN NULL;
END;
$$;

-- A contact created after its first message picks that message up, and with
-- it the direction (nothing has been sent to a contact that did not exist).
CREATE OR REPLACE FUNCTION public.linkar_contact_inbound_on_create()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  latest RECORD;
BEGIN
  SELECT w."receivedAt", w."payload", w."eventType" INTO latest
  FROM public."WebhookEvent" w
  WHERE w."workspaceId" = NEW."workspaceId"
    AND w."eventType" IN ('message.received', 'quick_reply.received', 'postback.received', 'story_mention.received')
    AND w."accountId" = NEW."instagramAccountId"
    AND w."recipientId" = NEW."igScopedUserId"
  ORDER BY w."receivedAt" DESC, w."id" DESC
  LIMIT 1;
  IF FOUND THEN
    NEW."lastInboundAt" := latest."receivedAt";
    NEW."lastInboundPreview" := public.linkar_inbound_preview(latest."payload", latest."eventType");
    IF NEW."lastOutboundAt" IS NULL OR NEW."lastOutboundAt" <= latest."receivedAt" THEN
      NEW."lastMessageDirection" := 'INBOUND';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- A message the workspace sent: the conversation is answered unless the
-- person has written again since. Deliveries complete out of order too, so
-- an older send never overwrites a newer one.
CREATE OR REPLACE FUNCTION public.linkar_contact_outbound_from_delivery()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  sent_at TIMESTAMP(3) := COALESCE(NEW."sentAt", NEW."updatedAt");
BEGIN
  UPDATE public."AutomationContact"
  SET "lastOutboundAt" = sent_at,
      "lastMessageDirection" = CASE
        WHEN "lastInboundAt" IS NOT NULL AND "lastInboundAt" > sent_at THEN 'INBOUND'
        ELSE 'OUTBOUND'
      END
  WHERE "workspaceId" = NEW."workspaceId"
    AND "instagramAccountId" = NEW."instagramAccountId"
    AND "igScopedUserId" = NEW."recipientId"
    AND ("lastOutboundAt" IS NULL OR "lastOutboundAt" <= sent_at);
  RETURN NULL;
END;
$$;

-- Deliveries are created PENDING or CLAIMED and only become SENT through an
-- update (completeOutboundDelivery), so this fires once per sent message.
DROP TRIGGER IF EXISTS "OutboundDelivery_contact_last_outbound" ON "OutboundDelivery";
CREATE TRIGGER "OutboundDelivery_contact_last_outbound"
AFTER UPDATE OF "state" ON "OutboundDelivery"
FOR EACH ROW
WHEN (
  NEW."state" = 'SENT'
  AND OLD."state" IS DISTINCT FROM 'SENT'
  AND NEW."instagramAccountId" IS NOT NULL
  AND NEW."recipientId" IS NOT NULL
  AND NEW."kind" NOT IN ('LEAD_EMAIL', 'LEAD_WEBHOOK')
)
EXECUTE FUNCTION public.linkar_contact_outbound_from_delivery();

-- Backfill (best effort): the latest SENT delivery per person still in the
-- ledger, then the direction from the later of the two timestamps (a tie
-- counts as answered). Contacts with no history left keep a NULL direction
-- and group as before: unread decides.
UPDATE "AutomationContact" c
SET "lastOutboundAt" = d."lastSentAt"
FROM (
  SELECT "workspaceId", "instagramAccountId", "recipientId", MAX(COALESCE("sentAt", "updatedAt")) AS "lastSentAt"
  FROM "OutboundDelivery"
  WHERE "state" = 'SENT'
    AND "instagramAccountId" IS NOT NULL
    AND "recipientId" IS NOT NULL
    AND "kind" NOT IN ('LEAD_EMAIL', 'LEAD_WEBHOOK')
  GROUP BY "workspaceId", "instagramAccountId", "recipientId"
) d
WHERE c."workspaceId" = d."workspaceId"
  AND c."instagramAccountId" = d."instagramAccountId"
  AND c."igScopedUserId" = d."recipientId"
  AND (c."lastOutboundAt" IS NULL OR c."lastOutboundAt" < d."lastSentAt");

UPDATE "AutomationContact"
SET "lastMessageDirection" = CASE
  WHEN "lastOutboundAt" IS NOT NULL AND ("lastInboundAt" IS NULL OR "lastOutboundAt" >= "lastInboundAt") THEN 'OUTBOUND'
  ELSE 'INBOUND'
END
WHERE "lastMessageDirection" IS NULL
  AND ("lastInboundAt" IS NOT NULL OR "lastOutboundAt" IS NOT NULL);
