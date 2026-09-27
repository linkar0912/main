-- Denormalizes each contact's latest inbound message onto AutomationContact so
-- the inbox list sorts and pages on an index instead of running a LATERAL
-- lookup into WebhookEvent for every contact in the workspace.
--
-- Nullable columns only (catalog-only, no table rewrite), so this is safe to
-- apply while the previous release is still serving traffic. Existing rows are
-- filled by scripts/backfill-contact-last-inbound.mjs; the index is created
-- CONCURRENTLY by the next migration.
ALTER TABLE "AutomationContact"
ADD COLUMN IF NOT EXISTS "lastInboundAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "lastInboundPreview" TEXT;

-- Same preview the inbox query used to compute inline.
CREATE OR REPLACE FUNCTION public.linkar_inbound_preview(payload JSONB, event_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NULLIF(BTRIM(payload->>'text'), '') IS NOT NULL THEN BTRIM(payload->>'text')
    WHEN event_type = 'story_mention.received' THEN 'Mentioned you in a story'
    ELSE 'Instagram interaction'
  END
$$;

-- A new inbound message moves its contact to the top of the inbox. Events
-- arrive out of order across workers, so an older event never overwrites a
-- newer one.
CREATE OR REPLACE FUNCTION public.linkar_contact_inbound_from_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public."AutomationContact"
  SET "lastInboundAt" = NEW."receivedAt",
      "lastInboundPreview" = public.linkar_inbound_preview(NEW."payload", NEW."eventType")
  WHERE "workspaceId" = NEW."workspaceId"
    AND "instagramAccountId" = NEW."accountId"
    AND "igScopedUserId" = NEW."recipientId"
    AND ("lastInboundAt" IS NULL OR "lastInboundAt" <= NEW."receivedAt");
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "WebhookEvent_contact_last_inbound" ON "WebhookEvent";
CREATE TRIGGER "WebhookEvent_contact_last_inbound"
AFTER INSERT ON "WebhookEvent"
FOR EACH ROW
WHEN (
  NEW."eventType" IN ('message.received', 'quick_reply.received', 'postback.received', 'story_mention.received')
  AND NEW."accountId" IS NOT NULL
  AND NEW."recipientId" IS NOT NULL
)
EXECUTE FUNCTION public.linkar_contact_inbound_from_event();

-- The webhook runner records the event and creates the contact concurrently,
-- so a contact created after its first message picks that message up here.
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
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AutomationContact_last_inbound_on_create" ON "AutomationContact";
CREATE TRIGGER "AutomationContact_last_inbound_on_create"
BEFORE INSERT ON "AutomationContact"
FOR EACH ROW
WHEN (NEW."lastInboundAt" IS NULL)
EXECUTE FUNCTION public.linkar_contact_inbound_on_create();
