-- /r/[slug] is one public namespace, but TrackedLink.slug was only unique per
-- workspace, so a second workspace could create the same slug and the public
-- lookup (findFirst by slug) could serve either tenant's destination.
--
-- Step 1: de-duplicate existing rows deterministically before the unique index
-- is built. For every slug shared by more than one row, the OLDEST row
-- (ordered by "createdAt" ASC, then "id" ASC) keeps the slug unchanged. Every
-- newer duplicate is renamed to:
--
--   <original slug> || '-' || lower(last 8 alphanumeric characters of its id)
--
-- e.g. a duplicate "summer-sale" whose id is
-- "tlink_0b4e...-...-9f31c2aa" becomes "summer-sale-9f31c2aa". The rename is
-- recorded here so operators can find affected rows afterwards with:
--
--   SELECT "id", "workspaceId", "slug" FROM "TrackedLink"
--   WHERE "slug" ~ '-[0-9a-z]{8}$' AND "updatedAt" >= <deploy time>;
--
-- and tell the owning workspaces that their short link moved. Clicks are keyed
-- by link id, so click history stays attached to the renamed row.
WITH "ranked" AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (PARTITION BY "slug" ORDER BY "createdAt" ASC, "id" ASC) AS "position"
  FROM "TrackedLink"
)
UPDATE "TrackedLink" AS "link"
SET
  "slug" = "link"."slug" || '-' || lower(right(regexp_replace("link"."id", '[^0-9A-Za-z]', '', 'g'), 8)),
  "updatedAt" = CURRENT_TIMESTAMP
FROM "ranked"
WHERE "ranked"."id" = "link"."id"
  AND "ranked"."position" > 1;

-- Step 2: enforce global uniqueness. If a renamed slug ever collided with an
-- existing one this statement fails and the whole migration rolls back,
-- leaving the table untouched. TrackedLink is a small per-workspace table, so
-- a plain (non-concurrent) build is acceptable inside Prisma's transaction.
CREATE UNIQUE INDEX IF NOT EXISTS "TrackedLink_slug_key" ON "TrackedLink" ("slug");

-- Step 3: the composite key is now redundant (slug alone is unique) and
-- workspace-scoped lookups filter by slug then check the workspace.
DROP INDEX IF EXISTS "TrackedLink_workspaceId_slug_key";
