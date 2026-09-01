CREATE TABLE "HelpSearchEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "query" VARCHAR(120) NOT NULL,
    "resultCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpSearchEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HelpArticleFeedback" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "articleKey" VARCHAR(160) NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpArticleFeedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HelpSearchEvent_workspaceId_createdAt_idx"
ON "HelpSearchEvent"("workspaceId", "createdAt");

CREATE INDEX "HelpArticleFeedback_workspaceId_articleKey_createdAt_idx"
ON "HelpArticleFeedback"("workspaceId", "articleKey", "createdAt");

ALTER TABLE "HelpSearchEvent"
ADD CONSTRAINT "HelpSearchEvent_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HelpArticleFeedback"
ADD CONSTRAINT "HelpArticleFeedback_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The `public` schema is exposed through Supabase PostgREST. Default-deny RLS
-- blocks anon/authenticated API access; server-side Prisma connects as owner.
ALTER TABLE "HelpSearchEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HelpArticleFeedback" ENABLE ROW LEVEL SECURITY;
