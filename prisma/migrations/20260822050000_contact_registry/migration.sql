-- Workspace-wide contact registry: first-contact detection + captured emails.
CREATE TYPE "ContactState" AS ENUM ('NONE', 'AWAITING_EMAIL', 'CAPTURED');

CREATE TABLE "AutomationContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "instagramAccountId" TEXT NOT NULL,
    "igScopedUserId" TEXT NOT NULL,
    "email" TEXT,
    "state" "ContactState" NOT NULL DEFAULT 'NONE',
    "awaitingAutomationId" TEXT,
    "awaitingSince" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationContact_workspaceId_instagramAccountId_igScopedU_key" ON "AutomationContact"("workspaceId", "instagramAccountId", "igScopedUserId");
CREATE INDEX "AutomationContact_workspaceId_state_idx" ON "AutomationContact"("workspaceId", "state");

ALTER TABLE "AutomationContact" ADD CONSTRAINT "AutomationContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
