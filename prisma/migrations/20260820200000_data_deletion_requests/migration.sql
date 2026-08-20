CREATE TABLE "DataDeletionRequest" (
    "id" TEXT NOT NULL,
    "confirmationCode" TEXT NOT NULL,
    "instagramUserIdHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DataDeletionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DataDeletionRequest_confirmationCode_key" ON "DataDeletionRequest"("confirmationCode");
CREATE INDEX "DataDeletionRequest_requestedAt_idx" ON "DataDeletionRequest"("requestedAt");
