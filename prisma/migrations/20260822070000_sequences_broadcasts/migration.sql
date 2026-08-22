-- Sequences: timed drip campaigns + per-contact enrollment progress.
CREATE TABLE "AutomationSequence" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "steps" JSONB NOT NULL,
    "sourceAutomationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SequenceEnrollment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextSendAt" TIMESTAMP(3),
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationSequence_workspaceId_status_idx" ON "AutomationSequence"("workspaceId", "status");
CREATE UNIQUE INDEX "SequenceEnrollment_sequenceId_contactId_key" ON "SequenceEnrollment"("sequenceId", "contactId");
CREATE INDEX "SequenceEnrollment_state_nextSendAt_idx" ON "SequenceEnrollment"("state", "nextSendAt");
CREATE INDEX "SequenceEnrollment_contactId_idx" ON "SequenceEnrollment"("contactId");
CREATE INDEX "Broadcast_workspaceId_createdAt_idx" ON "Broadcast"("workspaceId", "createdAt");

ALTER TABLE "AutomationSequence" ADD CONSTRAINT "AutomationSequence_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "AutomationSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SequenceEnrollment" ADD CONSTRAINT "SequenceEnrollment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "AutomationContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Broadcast" ADD CONSTRAINT "Broadcast_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
