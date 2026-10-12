-- Round 7: first-time onboarding. Additive only: two new tables, no change to
-- any existing column.
--
-- WorkspaceOnboarding holds the owner's answers per workspace; MemberOnboarding
-- holds the name each person wants to be called and, for invited team
-- members, what they will mainly do.

-- CreateTable
CREATE TABLE "WorkspaceOnboarding" (
    "workspaceId" TEXT NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "step" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "existingWorkspace" BOOLEAN NOT NULL DEFAULT false,
    "inviteDismissedAt" TIMESTAMP(3),
    "planDismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceOnboarding_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "MemberOnboarding" (
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" VARCHAR(40),
    "focus" TEXT,
    "step" INTEGER NOT NULL DEFAULT 1,
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "existingMember" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberOnboarding_pkey" PRIMARY KEY ("workspaceId","email")
);

-- AddForeignKey
ALTER TABLE "WorkspaceOnboarding" ADD CONSTRAINT "WorkspaceOnboarding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberOnboarding" ADD CONSTRAINT "MemberOnboarding_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every workspace and member that exists before this release is
-- marked as existing, so nobody already using Linkar is sent into the
-- onboarding flow; they get a dismissible invitation on Home instead.
-- Workspaces created after the release have no row and are sent in. Both
-- tables are new and empty here, so ON CONFLICT only guards a re-run.
INSERT INTO "WorkspaceOnboarding" ("workspaceId", "answers", "step", "existingWorkspace", "createdAt", "updatedAt")
SELECT "id", '{}'::jsonb, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "Workspace"
ON CONFLICT ("workspaceId") DO NOTHING;

INSERT INTO "MemberOnboarding" ("workspaceId", "email", "step", "existingMember", "createdAt", "updatedAt")
SELECT DISTINCT "workspaceId", lower("email"), 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM "WorkspaceMember"
ON CONFLICT ("workspaceId", "email") DO NOTHING;

-- Default-deny for Supabase's PostgREST roles, like every other app table
-- (see 20260829180000_enable_rls). The app's own role owns the tables and is
-- unaffected.
ALTER TABLE "WorkspaceOnboarding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MemberOnboarding" ENABLE ROW LEVEL SECURITY;
