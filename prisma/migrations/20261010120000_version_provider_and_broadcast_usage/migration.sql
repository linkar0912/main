-- Automation version snapshots record the channel they were taken on, so a
-- restore puts the automation back on the same provider. Nullable and not
-- backfilled: restore infers the provider from the pin columns for older rows.
-- Adding a nullable column without a default is a catalog-only change.
ALTER TABLE "AutomationVersion" ADD COLUMN "provider" "AutomationProvider";

-- POST /api/broadcasts now reserves the monthly broadcast allowance with an
-- atomic increment of WorkspaceUsagePeriod.broadcastsCreated instead of
-- counting Broadcast rows. Seed the current UTC month from the rows that
-- already exist so the switch does not hand every workspace a fresh allowance.
INSERT INTO "WorkspaceUsagePeriod" ("workspaceId", "periodStart", "broadcastsCreated", "updatedAt")
SELECT b."workspaceId", date_trunc('month', NOW() AT TIME ZONE 'UTC')::date, COUNT(*)::int, NOW()
FROM "Broadcast" b
WHERE b."createdAt" >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
GROUP BY b."workspaceId"
ON CONFLICT ("workspaceId", "periodStart") DO UPDATE
  SET "broadcastsCreated" = GREATEST("WorkspaceUsagePeriod"."broadcastsCreated", EXCLUDED."broadcastsCreated"),
      "updatedAt" = NOW();
