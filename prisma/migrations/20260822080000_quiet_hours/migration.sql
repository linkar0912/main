-- Workspace-level messaging quiet hours (null = always-on).
ALTER TABLE "Workspace" ADD COLUMN "quietStartHour" INTEGER;
ALTER TABLE "Workspace" ADD COLUMN "quietEndHour" INTEGER;
ALTER TABLE "Workspace" ADD COLUMN "timezone" TEXT;
