CREATE TABLE "PlanDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "memberLimit" INTEGER,
  "automationLimit" INTEGER,
  "instagramConnectionLimit" INTEGER,
  "facebookConnectionLimit" INTEGER,
  "sequenceLimit" INTEGER,
  "monthlyBroadcastLimit" INTEGER,
  "monthlyDeliveryLimit" INTEGER,
  "sequencesEnabled" BOOLEAN NOT NULL DEFAULT false,
  "broadcastsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "trackedLinksEnabled" BOOLEAN NOT NULL DEFAULT false,
  "teamEnabled" BOOLEAN NOT NULL DEFAULT false,
  "facebookEnabled" BOOLEAN NOT NULL DEFAULT false,
  "exportsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlanDefinition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanDefinition_nonnegative_limits" CHECK (
    ("memberLimit" IS NULL OR "memberLimit" >= 0) AND
    ("automationLimit" IS NULL OR "automationLimit" >= 0) AND
    ("instagramConnectionLimit" IS NULL OR "instagramConnectionLimit" >= 0) AND
    ("facebookConnectionLimit" IS NULL OR "facebookConnectionLimit" >= 0) AND
    ("sequenceLimit" IS NULL OR "sequenceLimit" >= 0) AND
    ("monthlyBroadcastLimit" IS NULL OR "monthlyBroadcastLimit" >= 0) AND
    ("monthlyDeliveryLimit" IS NULL OR "monthlyDeliveryLimit" >= 0)
  )
);

CREATE TABLE "WorkspaceEntitlement" (
  "workspaceId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "overrides" JSONB NOT NULL DEFAULT '{}',
  "version" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceEntitlement_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "WorkspaceUsagePeriod" (
  "workspaceId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "deliveriesReserved" INTEGER NOT NULL DEFAULT 0,
  "broadcastsCreated" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceUsagePeriod_pkey" PRIMARY KEY ("workspaceId", "periodStart"),
  CONSTRAINT "WorkspaceUsagePeriod_nonnegative" CHECK ("deliveriesReserved" >= 0 AND "broadcastsCreated" >= 0)
);

CREATE TABLE "WorkspaceUsageReservation" (
  "deliveryKey" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceUsageReservation_pkey" PRIMARY KEY ("deliveryKey")
);

CREATE UNIQUE INDEX "PlanDefinition_key_key" ON "PlanDefinition"("key");
CREATE INDEX "PlanDefinition_isActive_key_idx" ON "PlanDefinition"("isActive", "key");
CREATE INDEX "WorkspaceEntitlement_planId_idx" ON "WorkspaceEntitlement"("planId");
CREATE INDEX "WorkspaceUsagePeriod_periodStart_workspaceId_idx" ON "WorkspaceUsagePeriod"("periodStart", "workspaceId");
CREATE INDEX "WorkspaceUsageReservation_workspaceId_periodStart_idx" ON "WorkspaceUsageReservation"("workspaceId", "periodStart");

ALTER TABLE "WorkspaceEntitlement" ADD CONSTRAINT "WorkspaceEntitlement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceEntitlement" ADD CONSTRAINT "WorkspaceEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "PlanDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkspaceUsagePeriod" ADD CONSTRAINT "WorkspaceUsagePeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceUsageReservation" ADD CONSTRAINT "WorkspaceUsageReservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanDefinition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceUsagePeriod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceUsageReservation" ENABLE ROW LEVEL SECURITY;

INSERT INTO "PlanDefinition" (
  "id", "key", "name", "memberLimit", "automationLimit", "instagramConnectionLimit",
  "facebookConnectionLimit", "sequenceLimit", "monthlyBroadcastLimit", "monthlyDeliveryLimit",
  "sequencesEnabled", "broadcastsEnabled", "trackedLinksEnabled", "teamEnabled",
  "facebookEnabled", "exportsEnabled", "updatedAt"
) VALUES (
  'plan_free', 'free', 'Free', 2, 3, 1, 0, 0, 0, 100,
  false, false, false, false, false, false, CURRENT_TIMESTAMP
);

INSERT INTO "WorkspaceEntitlement" ("workspaceId", "planId", "overrides", "version", "updatedAt")
SELECT "id", 'plan_free', '{}', 1, CURRENT_TIMESTAMP FROM "Workspace";
