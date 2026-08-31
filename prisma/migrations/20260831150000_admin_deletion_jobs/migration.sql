CREATE TYPE "AdminDeletionTargetKind" AS ENUM ('USER', 'WORKSPACE');
CREATE TYPE "AdminDeletionJobState" AS ENUM ('QUEUED', 'RUNNING', 'CANCELLING', 'CANCELLED', 'COMPLETED', 'FAILED');
CREATE TYPE "AdminDeletionStageKind" AS ENUM ('VALIDATE', 'CANCEL_WORK', 'DISCONNECT_PROVIDERS', 'DELETE_TENANT_DATA', 'MARK_IRREVERSIBLE', 'DELETE_AUTH_USER', 'FINALIZE');
CREATE TYPE "AdminDeletionStageState" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

CREATE TABLE "AdminDeletionJob" (
  "id" TEXT NOT NULL,
  "targetKind" "AdminDeletionTargetKind" NOT NULL,
  "targetId" TEXT NOT NULL,
  "state" "AdminDeletionJobState" NOT NULL DEFAULT 'QUEUED',
  "impact" JSONB NOT NULL,
  "impactVersion" INTEGER NOT NULL,
  "impactDigest" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "requestedByUserId" TEXT NOT NULL,
  "requestedByEmail" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "includeAuthUsers" BOOLEAN NOT NULL DEFAULT false,
  "currentStage" "AdminDeletionStageKind",
  "progress" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "cancelRequestedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancelledByUserId" TEXT,
  "irreversibleAt" TIMESTAMP(3),
  "terminalErrorCode" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminDeletionJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminDeletionJob_idempotencyKey_key" ON "AdminDeletionJob"("idempotencyKey");
CREATE INDEX "AdminDeletionJob_state_createdAt_idx" ON "AdminDeletionJob"("state", "createdAt");
CREATE INDEX "AdminDeletionJob_targetKind_targetId_state_idx" ON "AdminDeletionJob"("targetKind", "targetId", "state");
CREATE UNIQUE INDEX "AdminDeletionJob_active_target_key" ON "AdminDeletionJob"("targetKind", "targetId") WHERE "state" IN ('QUEUED', 'RUNNING', 'CANCELLING');

CREATE TABLE "AdminDeletionStage" (
  "jobId" TEXT NOT NULL,
  "stage" "AdminDeletionStageKind" NOT NULL,
  "state" "AdminDeletionStageState" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "safeErrorCode" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminDeletionStage_pkey" PRIMARY KEY ("jobId", "stage"),
  CONSTRAINT "AdminDeletionStage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AdminDeletionJob"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AdminDeletionStage_state_updatedAt_idx" ON "AdminDeletionStage"("state", "updatedAt");

ALTER TABLE "AdminDeletionJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminDeletionStage" ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION linkar_prevent_completed_stage_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD."state" = 'COMPLETED' THEN RAISE EXCEPTION 'completed deletion stages are immutable'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "AdminDeletionStage_completed_immutable" BEFORE UPDATE OR DELETE ON "AdminDeletionStage" FOR EACH ROW EXECUTE FUNCTION linkar_prevent_completed_stage_mutation();
