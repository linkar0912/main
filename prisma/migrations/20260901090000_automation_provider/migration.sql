CREATE TYPE "AutomationProvider" AS ENUM ('INSTAGRAM', 'FACEBOOK');

ALTER TABLE "Automation" ADD COLUMN "provider" "AutomationProvider";

UPDATE "Automation"
SET "provider" = CASE
  WHEN "facebookPageId" IS NOT NULL THEN 'FACEBOOK'::"AutomationProvider"
  ELSE 'INSTAGRAM'::"AutomationProvider"
END;

ALTER TABLE "Automation" ALTER COLUMN "provider" SET NOT NULL;

CREATE INDEX "Automation_workspaceId_provider_idx"
ON "Automation"("workspaceId", "provider");

ALTER TABLE "Automation"
ADD CONSTRAINT "Automation_provider_pin_check" CHECK (
  ("provider" = 'FACEBOOK' AND "facebookPageId" IS NOT NULL AND "instagramAccountId" IS NULL)
  OR
  ("provider" = 'INSTAGRAM' AND "facebookPageId" IS NULL)
);
