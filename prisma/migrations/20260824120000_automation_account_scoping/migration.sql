-- Automations can be pinned to one connected Instagram account (igUserId).
-- Null keeps the previous behavior: the automation answers for every account.
ALTER TABLE "Automation" ADD COLUMN "instagramAccountId" TEXT;
