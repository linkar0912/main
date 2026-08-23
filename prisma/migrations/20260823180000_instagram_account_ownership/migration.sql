-- Run `pnpm preflight:instagram-ownership` against the target database before deploying this migration.
DROP INDEX "InstagramConnection_workspaceId_igUserId_key";
CREATE UNIQUE INDEX "InstagramConnection_igUserId_key" ON "InstagramConnection"("igUserId");
