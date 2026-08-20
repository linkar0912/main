ALTER TABLE "DataDeletionRequest" RENAME COLUMN "instagramUserIdHash" TO "signedRequestHash";
ALTER TABLE "DataDeletionRequest" ALTER COLUMN "completedAt" DROP NOT NULL;
CREATE UNIQUE INDEX "DataDeletionRequest_signedRequestHash_key" ON "DataDeletionRequest"("signedRequestHash");
