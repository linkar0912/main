-- Capture activation-time state on every automation version snapshot so a
-- restore from history brings back the exact status, priority, Instagram
-- pinning, and next-media binding. Without these columns, a snapshot only
-- recorded the name + definition, so restoring silently demoted ACTIVE
-- campaigns to DRAFT-equivalent rows with no boundMediaId/activatedAt -
-- which breaks the next-media resolver (publishedAt > activatedAt).
ALTER TABLE "AutomationVersion"
  ADD COLUMN "status" "AutomationStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "activatedAt" TIMESTAMP(3),
  ADD COLUMN "boundMediaId" TEXT,
  ADD COLUMN "instagramAccountId" TEXT;
