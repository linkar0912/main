-- Contact-level automation pause, set when someone on the team replies to a
-- person by hand (from the Instagram app or the Linkar inbox). Nullable
-- columns only: a catalog-only change with no table rewrite, safe to apply
-- while the previous release is still serving traffic.
ALTER TABLE "AutomationContact"
ADD COLUMN IF NOT EXISTS "automationsPausedUntil" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "automationsPausedReason" TEXT;
