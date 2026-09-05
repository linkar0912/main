CREATE TABLE "PremiumInviteCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 30,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PremiumInviteCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PremiumInviteRedemption" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "redeemedByUserId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PremiumInviteRedemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PremiumInviteCode_codeHash_key" ON "PremiumInviteCode"("codeHash");
CREATE INDEX "PremiumInviteCode_planId_idx" ON "PremiumInviteCode"("planId");
CREATE INDEX "PremiumInviteCode_revokedAt_expiresAt_idx" ON "PremiumInviteCode"("revokedAt", "expiresAt");
CREATE INDEX "PremiumInviteCode_createdByUserId_createdAt_idx" ON "PremiumInviteCode"("createdByUserId", "createdAt");
CREATE UNIQUE INDEX "PremiumInviteRedemption_codeId_key" ON "PremiumInviteRedemption"("codeId");
CREATE INDEX "PremiumInviteRedemption_workspaceId_startsAt_expiresAt_idx" ON "PremiumInviteRedemption"("workspaceId", "startsAt", "expiresAt");
CREATE INDEX "PremiumInviteRedemption_planId_idx" ON "PremiumInviteRedemption"("planId");
CREATE INDEX "PremiumInviteRedemption_redeemedByUserId_createdAt_idx" ON "PremiumInviteRedemption"("redeemedByUserId", "createdAt");
ALTER TABLE "PremiumInviteCode" ADD CONSTRAINT "PremiumInviteCode_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PremiumInviteRedemption" ADD CONSTRAINT "PremiumInviteRedemption_codeId_fkey" FOREIGN KEY ("codeId") REFERENCES "PremiumInviteCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PremiumInviteRedemption" ADD CONSTRAINT "PremiumInviteRedemption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PremiumInviteRedemption" ADD CONSTRAINT "PremiumInviteRedemption_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
