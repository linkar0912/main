ALTER TABLE "Workspace"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE INDEX "Workspace_updatedAt_id_idx" ON "Workspace"("updatedAt", "id");
