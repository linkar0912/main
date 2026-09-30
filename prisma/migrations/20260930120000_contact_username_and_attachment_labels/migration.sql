-- Instagram handles were only held in a 15-minute in-process cache, so after
-- every restart (or on another replica) the inbox fell back to anonymous
-- "Instagram contact" labels. Keep the handle on the contact instead.
-- Nullable column only: catalog change, no table rewrite.
ALTER TABLE "AutomationContact"
ADD COLUMN IF NOT EXISTS "instagramUsername" TEXT;

-- Comment webhooks carry the author's handle (payload.senderUsername). Copy it
-- onto the contact whenever such an event lands for an existing contact.
CREATE OR REPLACE FUNCTION public.linkar_contact_username_from_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  UPDATE public."AutomationContact"
  SET "instagramUsername" = NEW."payload"->>'senderUsername'
  WHERE "workspaceId" = NEW."workspaceId"
    AND "instagramAccountId" = NEW."accountId"
    AND "igScopedUserId" = NEW."recipientId"
    AND "instagramUsername" IS DISTINCT FROM NEW."payload"->>'senderUsername';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "WebhookEvent_contact_username" ON "WebhookEvent";
CREATE TRIGGER "WebhookEvent_contact_username"
AFTER INSERT ON "WebhookEvent"
FOR EACH ROW
WHEN (
  NULLIF(BTRIM(NEW."payload"->>'senderUsername'), '') IS NOT NULL
  AND NEW."accountId" IS NOT NULL
  AND NEW."recipientId" IS NOT NULL
)
EXECUTE FUNCTION public.linkar_contact_username_from_event();

-- The usual comment -> DM flow sees the comment (with the handle) before the
-- contact exists, so a new contact picks up the handle from earlier events.
CREATE OR REPLACE FUNCTION public.linkar_contact_username_on_create()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  SELECT w."payload"->>'senderUsername' INTO NEW."instagramUsername"
  FROM public."WebhookEvent" w
  WHERE w."workspaceId" = NEW."workspaceId"
    AND w."accountId" = NEW."instagramAccountId"
    AND w."recipientId" = NEW."igScopedUserId"
    AND NULLIF(BTRIM(w."payload"->>'senderUsername'), '') IS NOT NULL
  ORDER BY w."receivedAt" DESC, w."id" DESC
  LIMIT 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AutomationContact_username_on_create" ON "AutomationContact";
CREATE TRIGGER "AutomationContact_username_on_create"
BEFORE INSERT ON "AutomationContact"
FOR EACH ROW
WHEN (NEW."instagramUsername" IS NULL)
EXECUTE FUNCTION public.linkar_contact_username_on_create();

-- Backfill handles for contacts that already commented.
UPDATE "AutomationContact" c
SET "instagramUsername" = e."username"
FROM (
  SELECT DISTINCT ON (w."workspaceId", w."accountId", w."recipientId")
    w."workspaceId", w."accountId", w."recipientId", w."payload"->>'senderUsername' AS "username"
  FROM "WebhookEvent" w
  WHERE NULLIF(BTRIM(w."payload"->>'senderUsername'), '') IS NOT NULL
    AND w."accountId" IS NOT NULL
    AND w."recipientId" IS NOT NULL
  ORDER BY w."workspaceId", w."accountId", w."recipientId", w."receivedAt" DESC, w."id" DESC
) e
WHERE c."workspaceId" = e."workspaceId"
  AND c."instagramAccountId" = e."accountId"
  AND c."igScopedUserId" = e."recipientId"
  AND c."instagramUsername" IS NULL;

-- Text-less DMs (photos, reels, voice notes, stickers) previewed as the vague
-- "Instagram interaction". Mirrors describeInboundWithoutText in src/lib/inbox.ts.
CREATE OR REPLACE FUNCTION public.linkar_inbound_preview(payload JSONB, event_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN NULLIF(BTRIM(payload->>'text'), '') IS NOT NULL THEN BTRIM(payload->>'text')
    WHEN NULLIF(payload->>'attachmentType', '') IS NOT NULL THEN CASE payload->>'attachmentType'
      WHEN 'image' THEN 'Sent a photo'
      WHEN 'video' THEN 'Sent a video'
      WHEN 'audio' THEN 'Sent a voice message'
      WHEN 'file' THEN 'Sent a file'
      WHEN 'share' THEN 'Shared a post'
      WHEN 'ig_post' THEN 'Shared a post'
      WHEN 'ig_reel' THEN 'Shared a reel'
      WHEN 'reel' THEN 'Shared a reel'
      WHEN 'animated_image_share' THEN 'Sent a GIF'
      WHEN 'sticker' THEN 'Sent a sticker'
      WHEN 'like_heart' THEN 'Sent a ❤️'
      WHEN 'unsupported' THEN 'Sent a message Instagram doesn''t share with apps'
      ELSE 'Sent an attachment'
    END
    WHEN event_type = 'story_mention.received' THEN 'Mentioned you in a story'
    WHEN event_type = 'quick_reply.received' THEN 'Tapped a quick reply'
    WHEN event_type = 'postback.received' THEN 'Tapped a button'
    ELSE 'Sent an attachment'
  END
$$;

-- Re-derive the previews that used the old label from each contact's latest
-- inbound event.
UPDATE "AutomationContact" c
SET "lastInboundPreview" = public.linkar_inbound_preview(e."payload", e."eventType")
FROM (
  SELECT DISTINCT ON (w."workspaceId", w."accountId", w."recipientId")
    w."workspaceId", w."accountId", w."recipientId", w."payload", w."eventType"
  FROM "WebhookEvent" w
  WHERE w."eventType" IN ('message.received', 'quick_reply.received', 'postback.received', 'story_mention.received')
    AND w."accountId" IS NOT NULL
    AND w."recipientId" IS NOT NULL
  ORDER BY w."workspaceId", w."accountId", w."recipientId", w."receivedAt" DESC, w."id" DESC
) e
WHERE c."lastInboundPreview" = 'Instagram interaction'
  AND c."workspaceId" = e."workspaceId"
  AND c."instagramAccountId" = e."accountId"
  AND c."igScopedUserId" = e."recipientId";
