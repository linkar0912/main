-- Facebook Page support (Option B - parallel to Instagram, not a generalization).
-- One new table, two new nullable columns, no destructive changes to existing
-- data. An automation pins to either instagramAccountId OR facebookPageId; the
-- runner treats them as separate channels and the UI enforces the choice.

-- 1. The Page connection table. Same encryption + ownership pattern as
--    InstagramConnection: one Page can only be owned by one workspace.
CREATE TABLE "FacebookPageConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "ConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacebookPageConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookPageConnection_pageId_key" ON "FacebookPageConnection"("pageId");
CREATE INDEX "FacebookPageConnection_workspaceId_status_idx" ON "FacebookPageConnection"("workspaceId", "status");

ALTER TABLE "FacebookPageConnection" ADD CONSTRAINT "FacebookPageConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;

-- 2. Optional page pin on Automation. The runner (src/lib/automation/runner.ts)
--    dispatches on whether instagramAccountId or facebookPageId is set; both
--    null means the automation answers every connected channel in the workspace
--    (existing IG behavior, now also picking up FB events when the FB channel
--    adds new automations that pin).
ALTER TABLE "Automation" ADD COLUMN "facebookPageId" TEXT;

-- 3. Same column on the version-history table so a restored snapshot re-pins
--    to the same channel it was originally created for.
ALTER TABLE "AutomationVersion" ADD COLUMN "facebookPageId" TEXT;
