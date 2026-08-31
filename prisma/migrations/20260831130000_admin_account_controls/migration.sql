CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETION_PENDING');
CREATE TYPE "PlatformUserStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

ALTER TABLE "Workspace"
  ADD COLUMN "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "suspendedAt" TIMESTAMP(3),
  ADD COLUMN "suspendedReason" TEXT,
  ADD COLUMN "suspendedByUserId" TEXT,
  ADD COLUMN "deletionScheduledAt" TIMESTAMP(3);

ALTER TABLE "WorkspaceMember" ADD COLUMN "userId" TEXT;

CREATE TABLE "PlatformUserControl" (
  "userId" TEXT NOT NULL,
  "status" "PlatformUserStatus" NOT NULL DEFAULT 'ACTIVE',
  "suspendedAt" TIMESTAMP(3),
  "suspendedReason" TEXT,
  "suspendedByUserId" TEXT,
  "sessionInvalidBefore" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformUserControl_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "Workspace_status_createdAt_idx" ON "Workspace"("status", "createdAt");
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX "PlatformUserControl_status_updatedAt_idx" ON "PlatformUserControl"("status", "updatedAt");

ALTER TABLE "PlatformUserControl" ENABLE ROW LEVEL SECURITY;
