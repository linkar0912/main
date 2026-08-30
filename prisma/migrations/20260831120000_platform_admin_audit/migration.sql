CREATE TYPE "AdminAuditPhase" AS ENUM ('ATTEMPT', 'SUCCESS', 'FAILURE');

CREATE TABLE "AdminAuditEvent" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "phase" "AdminAuditPhase" NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "actorEmail" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "reason" TEXT NOT NULL,
  "before" JSONB,
  "after" JSONB,
  "errorCode" TEXT,
  "ipHash" TEXT NOT NULL,
  "userAgent" TEXT NOT NULL,
  "origin" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminAuditEvent_requestId_phase_key"
  ON "AdminAuditEvent"("requestId", "phase");

CREATE INDEX "AdminAuditEvent_createdAt_id_idx"
  ON "AdminAuditEvent"("createdAt", "id");

CREATE INDEX "AdminAuditEvent_workspaceId_createdAt_idx"
  ON "AdminAuditEvent"("workspaceId", "createdAt");

ALTER TABLE "AdminAuditEvent" ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION reject_admin_audit_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'AdminAuditEvent is append-only';
END;
$$;

CREATE TRIGGER admin_audit_no_update_delete
BEFORE UPDATE OR DELETE ON "AdminAuditEvent"
FOR EACH ROW EXECUTE FUNCTION reject_admin_audit_mutation();
