DROP INDEX IF EXISTS "AutomationContact_id_workspaceId_key";
CREATE UNIQUE INDEX "AutomationContact_id_workspaceId_key"
  ON "AutomationContact"("id", "workspaceId");

DROP INDEX IF EXISTS "AutomationSequence_id_workspaceId_key";
CREATE UNIQUE INDEX "AutomationSequence_id_workspaceId_key"
  ON "AutomationSequence"("id", "workspaceId");

ALTER TABLE "SequenceEnrollment"
  DROP CONSTRAINT IF EXISTS "SequenceEnrollment_sequenceId_fkey",
  DROP CONSTRAINT IF EXISTS "SequenceEnrollment_contactId_fkey";

ALTER TABLE "SequenceEnrollment"
  ADD CONSTRAINT "SequenceEnrollment_sequenceId_workspaceId_fkey"
    FOREIGN KEY ("sequenceId", "workspaceId")
    REFERENCES "AutomationSequence"("id", "workspaceId")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SequenceEnrollment_contactId_workspaceId_fkey"
    FOREIGN KEY ("contactId", "workspaceId")
    REFERENCES "AutomationContact"("id", "workspaceId")
    ON DELETE CASCADE ON UPDATE CASCADE;
