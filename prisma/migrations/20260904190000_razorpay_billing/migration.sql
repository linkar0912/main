CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'ANNUAL');
CREATE TYPE "BillingSubscriptionStatus" AS ENUM (
  'CREATED', 'AUTHENTICATED', 'ACTIVE', 'PENDING', 'HALTED',
  'PAUSED', 'CANCELLED', 'COMPLETED', 'EXPIRED'
);
CREATE TYPE "BillingCheckoutState" AS ENUM ('CREATING', 'READY', 'VERIFIED', 'FAILED', 'EXPIRED');
CREATE TYPE "BillingWebhookState" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');

CREATE TABLE "BillingSubscription" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "providerSubscriptionId" TEXT,
  "providerCustomerId" TEXT,
  "providerPlanId" TEXT NOT NULL,
  "status" "BillingSubscriptionStatus" NOT NULL DEFAULT 'CREATED',
  "providerStatus" TEXT NOT NULL,
  "checkoutVerifiedAt" TIMESTAMP(3),
  "currentPeriodStart" TIMESTAMP(3),
  "currentPeriodEnd" TIMESTAMP(3),
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  "pendingPlanId" TEXT,
  "pendingInterval" "BillingInterval",
  "lastProviderEventAt" TIMESTAMP(3),
  "lastProviderEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BillingSubscription_period_order" CHECK (
    "currentPeriodStart" IS NULL OR "currentPeriodEnd" IS NULL OR "currentPeriodEnd" >= "currentPeriodStart"
  )
);

CREATE TABLE "BillingCheckoutAttempt" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "interval" "BillingInterval" NOT NULL,
  "state" "BillingCheckoutState" NOT NULL DEFAULT 'CREATING',
  "providerSubscriptionId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "failureCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingCheckoutAttempt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookEvent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "entityId" TEXT,
  "workspaceId" TEXT,
  "providerCreatedAt" TIMESTAMP(3) NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "state" "BillingWebhookState" NOT NULL DEFAULT 'RECEIVED',
  "failureCode" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingSubscription_workspaceId_key" ON "BillingSubscription"("workspaceId");
CREATE UNIQUE INDEX "BillingSubscription_providerSubscriptionId_key" ON "BillingSubscription"("providerSubscriptionId");
CREATE INDEX "BillingSubscription_status_currentPeriodEnd_idx" ON "BillingSubscription"("status", "currentPeriodEnd");
CREATE INDEX "BillingSubscription_planId_idx" ON "BillingSubscription"("planId");

CREATE UNIQUE INDEX "BillingCheckoutAttempt_providerSubscriptionId_key" ON "BillingCheckoutAttempt"("providerSubscriptionId");
CREATE INDEX "BillingCheckoutAttempt_workspaceId_state_expiresAt_idx" ON "BillingCheckoutAttempt"("workspaceId", "state", "expiresAt");
CREATE INDEX "BillingCheckoutAttempt_planId_idx" ON "BillingCheckoutAttempt"("planId");

CREATE UNIQUE INDEX "BillingWebhookEvent_eventId_key" ON "BillingWebhookEvent"("eventId");
CREATE INDEX "BillingWebhookEvent_entityId_providerCreatedAt_idx" ON "BillingWebhookEvent"("entityId", "providerCreatedAt");
CREATE INDEX "BillingWebhookEvent_workspaceId_receivedAt_idx" ON "BillingWebhookEvent"("workspaceId", "receivedAt");
CREATE INDEX "BillingWebhookEvent_state_receivedAt_idx" ON "BillingWebhookEvent"("state", "receivedAt");

ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingSubscription"
  ADD CONSTRAINT "BillingSubscription_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "PlanDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingCheckoutAttempt"
  ADD CONSTRAINT "BillingCheckoutAttempt_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BillingCheckoutAttempt"
  ADD CONSTRAINT "BillingCheckoutAttempt_planId_fkey"
  FOREIGN KEY ("planId") REFERENCES "PlanDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingWebhookEvent"
  ADD CONSTRAINT "BillingWebhookEvent_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingCheckoutAttempt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingWebhookEvent" ENABLE ROW LEVEL SECURITY;

INSERT INTO "PlanDefinition" (
  "id", "key", "name", "memberLimit", "automationLimit", "instagramConnectionLimit",
  "facebookConnectionLimit", "sequenceLimit", "monthlyBroadcastLimit", "monthlyDeliveryLimit",
  "sequencesEnabled", "broadcastsEnabled", "trackedLinksEnabled", "teamEnabled",
  "facebookEnabled", "exportsEnabled", "updatedAt"
) VALUES
  ('plan_free', 'free', 'Free', 1, 5, 1, 1, 0, 0, 1000, false, false, false, false, true, false, CURRENT_TIMESTAMP),
  ('plan_creator', 'creator', 'Creator', 2, 20, 2, 2, 10, 0, 5000, true, false, true, true, true, false, CURRENT_TIMESTAMP),
  ('plan_growth', 'growth', 'Growth', 5, 50, 5, 5, 25, 10, 25000, true, true, true, true, true, true, CURRENT_TIMESTAMP),
  ('plan_agency', 'agency', 'Agency', 10, 100, 10, 10, 50, 25, 50000, true, true, true, true, true, true, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "memberLimit" = EXCLUDED."memberLimit",
  "automationLimit" = EXCLUDED."automationLimit",
  "instagramConnectionLimit" = EXCLUDED."instagramConnectionLimit",
  "facebookConnectionLimit" = EXCLUDED."facebookConnectionLimit",
  "sequenceLimit" = EXCLUDED."sequenceLimit",
  "monthlyBroadcastLimit" = EXCLUDED."monthlyBroadcastLimit",
  "monthlyDeliveryLimit" = EXCLUDED."monthlyDeliveryLimit",
  "sequencesEnabled" = EXCLUDED."sequencesEnabled",
  "broadcastsEnabled" = EXCLUDED."broadcastsEnabled",
  "trackedLinksEnabled" = EXCLUDED."trackedLinksEnabled",
  "teamEnabled" = EXCLUDED."teamEnabled",
  "facebookEnabled" = EXCLUDED."facebookEnabled",
  "exportsEnabled" = EXCLUDED."exportsEnabled",
  "isActive" = true,
  "version" = "PlanDefinition"."version" + 1,
  "updatedAt" = CURRENT_TIMESTAMP;
