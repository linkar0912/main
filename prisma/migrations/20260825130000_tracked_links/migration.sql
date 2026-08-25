-- Tracked short links: branded /r/<slug> URLs that 302-redirect to a stored
-- destination, log per-click analytics, and optionally ping a conversion webhook.
-- The clicks table never stores the raw IP, only a salted + truncated hash.

CREATE TABLE "TrackedLink" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "utmSource" TEXT,
  "utmMedium" TEXT,
  "utmCampaign" TEXT,
  "utmTerm" TEXT,
  "utmContent" TEXT,
  "conversionUrl" TEXT,
  "notes" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TrackedLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrackedLink_workspaceId_slug_key" ON "TrackedLink" ("workspaceId", "slug");
CREATE INDEX "TrackedLink_workspaceId_createdAt_idx" ON "TrackedLink" ("workspaceId", "createdAt");

CREATE TABLE "TrackedLinkClick" (
  "id" TEXT NOT NULL,
  "linkId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "ipHash" TEXT NOT NULL,
  "userAgent" TEXT,
  "country" TEXT,
  "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TrackedLinkClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TrackedLinkClick_linkId_clickedAt_idx" ON "TrackedLinkClick" ("linkId", "clickedAt");
CREATE INDEX "TrackedLinkClick_workspaceId_clickedAt_idx" ON "TrackedLinkClick" ("workspaceId", "clickedAt");

ALTER TABLE "TrackedLink" ADD CONSTRAINT "TrackedLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE;
ALTER TABLE "TrackedLinkClick" ADD CONSTRAINT "TrackedLinkClick_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TrackedLink"("id") ON DELETE CASCADE;
