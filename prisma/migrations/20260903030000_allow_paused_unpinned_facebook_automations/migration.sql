-- Disconnecting a Facebook Page must preserve its automations without leaving
-- an active flow pointing at a removed connection. Paused Facebook automations
-- may therefore remain unpinned until the user selects a connected Page again.
ALTER TABLE "Automation"
DROP CONSTRAINT "Automation_provider_pin_check";

ALTER TABLE "Automation"
ADD CONSTRAINT "Automation_provider_pin_check" CHECK (
  (
    "provider" = 'FACEBOOK'
    AND "instagramAccountId" IS NULL
    AND ("facebookPageId" IS NOT NULL OR "status" = 'PAUSED')
  )
  OR
  ("provider" = 'INSTAGRAM' AND "facebookPageId" IS NULL)
);
