-- Human handoff: pause individual participants while a teammate handles the
-- conversation. The runner skips any participant whose `pausedAt` is set.

ALTER TABLE "AutomationParticipant"
  ADD COLUMN "pausedAt" TIMESTAMP(3),
  ADD COLUMN "pausedReason" TEXT,
  ADD COLUMN "pausedByUserId" TEXT;

CREATE INDEX "AutomationParticipant_pausedAt_idx" ON "AutomationParticipant" ("pausedAt");
