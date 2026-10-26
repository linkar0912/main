CREATE TYPE "AdminMcpKeyScope" AS ENUM ('READ', 'WRITE');

CREATE TABLE "AdminMcpKey" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "ownerEmail" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "scope" "AdminMcpKeyScope" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AdminMcpKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminMcpKey_expires_after_creation" CHECK ("expiresAt" > "createdAt")
);

CREATE UNIQUE INDEX "AdminMcpKey_tokenHash_key" ON "AdminMcpKey"("tokenHash");
CREATE INDEX "AdminMcpKey_ownerUserId_createdAt_idx" ON "AdminMcpKey"("ownerUserId", "createdAt");

ALTER TABLE "AdminMcpKey" ENABLE ROW LEVEL SECURITY;
